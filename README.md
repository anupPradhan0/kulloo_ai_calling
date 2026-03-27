# TypeScript Express Backend

Production-ready starter backend with:

- Language: TypeScript
- Runtime: Node.js
- Backend framework: Express.js
- Database: MongoDB (Mongoose)
- Validation: Zod
- Architecture: route -> controller -> service -> repository -> model

## Project Structure

```txt
src/
├── app.ts
├── server.ts
├── config/
│   ├── database.ts
│   └── env.ts
├── controllers/
│   └── user.controller.ts
├── middlewares/
│   └── error.middleware.ts
├── models/
│   └── user.model.ts
├── repositories/
│   └── user.repository.ts
├── routes/
│   ├── health.routes.ts
│   ├── index.ts
│   └── user.routes.ts
├── services/
│   └── user.service.ts
└── utils/
    └── api-error.ts
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Run in development:

```bash
npm run dev
```

4. Build and run production:

```bash
npm run build
npm start
```

## API Endpoints

Base URL: `http://localhost:5000/api`

- `GET /health` - health check
- `POST /users` - create user
- `GET /users` - list users
- `GET /users/:id` - get user by id
- `PATCH /users/:id` - update user
- `DELETE /users/:id` - delete user

### Example create payload

```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```
