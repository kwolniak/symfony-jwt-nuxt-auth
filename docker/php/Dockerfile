FROM php:8.5-fpm

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    unzip \
    libpq-dev \
    libicu-dev \
    libzip-dev \
    libsodium-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
  && rm -rf /var/lib/apt/lists/*

# Configure GD with JPEG + FreeType support
RUN docker-php-ext-configure gd \
    --with-freetype \
    --with-jpeg

# PHP extensions
# - opcache: static in PHP 8.5 binary, configured via php.ini (no install needed)
# - sodium:  static in PHP 8.2+ binary, already enabled (no install needed)
RUN docker-php-ext-install \
    pdo_pgsql \
    intl \
    zip \
    gd

# phpredis via PECL
RUN pecl install redis \
  && docker-php-ext-enable redis

# Composer 2
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Non-root user matching typical host UID/GID (avoids permission issues with bind mounts)
RUN groupadd -g 1000 appuser \
  && useradd -u 1000 -g appuser -s /bin/bash -m appuser

WORKDIR /app/backend

USER appuser

EXPOSE 9000
