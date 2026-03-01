<?php

namespace App\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Gesdinet\JWTRefreshTokenBundle\Generator\RefreshTokenGeneratorInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class GoogleController extends AbstractController
{
    public function __construct(
        private CacheItemPoolInterface $oauthCodesCache,
        private RefreshTokenGeneratorInterface $refreshTokenGenerator,
        #[Autowire(param: 'gesdinet_jwt_refresh_token.ttl')]
        private int $refreshTokenTtl,
        #[Autowire(env: 'NUXT_URL')]
        private string $nuxtUrl,
    ) {}

    #[Route('/connect/google', name: 'connect_google_start')]
    public function connect(ClientRegistry $clientRegistry): RedirectResponse
    {
        return $clientRegistry
            ->getClient('google')
            ->redirect(['openid', 'email', 'profile'], []);
    }

    #[Route('/connect/google/check', name: 'connect_google_check')]
    public function check(
        Request $request,
        ClientRegistry $clientRegistry,
        EntityManagerInterface $em,
        JWTTokenManagerInterface $jwtManager,
    ): RedirectResponse {
        $client = $clientRegistry->getClient('google');

        try {
            $googleUser = $client->fetchUser();
        } catch (\Exception) {
            return new RedirectResponse($this->nuxtUrl . '/login?error=oauth_failed');
        }

        $userData = $googleUser->toArray();
        if (empty($userData['email_verified'])) {
            return new RedirectResponse($this->nuxtUrl . '/login?error=email_not_verified');
        }

        $user = $em->getRepository(User::class)
            ->findOneBy(['email' => $googleUser->getEmail()]);

        if (!$user) {
            $user = new User();
            $user->setEmail($googleUser->getEmail());
            $user->setName($googleUser->getName());
            $user->setGoogleId($googleUser->getId());
            $em->persist($user);
            $em->flush();
        } elseif ($user->getGoogleId() === null) {
            $user->setGoogleId($googleUser->getId());
            $em->flush();
        }

        $jwt = $jwtManager->create($user);
        $refreshToken = $this->refreshTokenGenerator->createForUserWithTtl($user, $this->refreshTokenTtl);

        // Store both tokens in Redis with a 60-second TTL — one-time code pattern
        $code = bin2hex(random_bytes(32));
        $item = $this->oauthCodesCache->getItem("oauth_code_{$code}");
        $item->set([
            'token' => $jwt,
            'refresh_token' => $refreshToken->getRefreshToken(),
        ])->expiresAfter(60);
        $this->oauthCodesCache->save($item);

        return new RedirectResponse($this->nuxtUrl . '/api/auth/google/callback?code=' . $code);
    }

    #[Route('/api/auth/exchange-code', name: 'exchange_oauth_code', methods: ['POST'])]
    public function exchangeCode(Request $request): JsonResponse
    {
        $code = $request->getPayload()->get('code');
        if (!$code) {
            return new JsonResponse(['error' => 'Missing code'], 400);
        }

        $item = $this->oauthCodesCache->getItem("oauth_code_{$code}");
        if (!$item->isHit()) {
            return new JsonResponse(['error' => 'Invalid or expired code'], 401);
        }

        $data = $item->get();
        $this->oauthCodesCache->deleteItem("oauth_code_{$code}"); // one-time use

        return new JsonResponse([
            'token' => $data['token'],
            'refresh_token' => $data['refresh_token'],
        ]);
    }
}
