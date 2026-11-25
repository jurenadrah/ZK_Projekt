FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libonig-dev \
        libpq-dev \
    && docker-php-ext-install mbstring pgsql \
    && rm -rf /var/lib/apt/lists/*
