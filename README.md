<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

## Description

Play4Cash API built with NestJS.

## Project setup

```bash
npm install
```

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Administrator provisioning

Administrative accounts live in the `admins` collection and must be provisioned
before their first Google sign-in. The command is idempotent:

```bash
npm run admin:manage -- create --email admin@example.com --name "Admin Name"
npm run admin:manage -- list
npm run admin:manage -- disable --email admin@example.com
npm run admin:manage -- enable --email admin@example.com
```

Disabling an administrator revokes all of that account's active Admin sessions.
The command requires the same MongoDB, Redis, Google Admin client, and Admin JWT
configuration used by the API.
