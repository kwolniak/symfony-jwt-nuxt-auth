<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[IsGranted('ROLE_ADMIN')]
class AdminController extends AbstractController
{
    #[Route('/api/admin/users', name: 'api_admin_users', methods: ['GET'])]
    public function users(UserRepository $userRepository, Request $request): JsonResponse
    {
        $page  = max(1, $request->query->getInt('page', 1));
        $limit = max(1, min(100, $request->query->getInt('limit', 15)));
        $offset = ($page - 1) * $limit;

        $total = $userRepository->count([]);
        $users = $userRepository->findBy([], ['id' => 'ASC'], $limit, $offset);

        return new JsonResponse([
            'users' => array_map(fn(User $u) => [
                'id'    => (int) $u->getId(),
                'email' => $u->getUserIdentifier(),
                'name'  => $u->getName(),
                'roles' => $u->getRoles(),
            ], $users),
            'total' => $total,
        ]);
    }
}
