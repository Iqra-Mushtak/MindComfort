# MindComfort - Backend API

MindComfort is a web-based platform designed to offer an anonymous and affordable space for mental well-being and catharsis. This repository contains the backend REST APIs, WebSocket real-time communication, live audio token generation, and moderation services.

* **Live Application URL**: http://13.60.72.235
* **Frontend Repository**: https://github.com/Iqra-Mushtak/Mindcomfort-Frontend.git

---

## Technologies Used

* **Node.js & Express.js**: REST API routing and application server logic.
* **MongoDB Atlas & Mongoose**: Database storage for users, messages, podcasts, and subscriptions.
* **Redis**: In-memory store deployed via Docker for real-time chatroom rate limiting and active session presence.
* **Socket.io**: Real-time event communication for community chat, podcast comments and in-app notifications.
* **Agora RTC SDK**: Dynamic token generation for live audio broadcasting.
* **Stripe API**: Payment processing and webhook handling for subscription plans and podcast passes.
* **Backblaze B2**: Cloud object storage for mentor qualification documents.
* **Nodemailer**: SMTP email dispatch for registration, password reset OTP verification and mentor application approval/rejection.
* **JWT & Bcrypt.js**: Role-based access authorization, session handling, and salted password hashing.

---

## Core System Features

* **Role-Based Access Control**: Separate permissions for Client, Mentor, Admin, and Moderator accounts.
* **Anonymous Identity Masking**: Generates temporary UUIDs for clients joining chatrooms to hide real identities from other users.
* **Multi-Tier Rate Limiting**: Redis enforces a 15 msg/min cap in chatrooms, while API limiters protect login (5 attempts/15 min), OTP verification (3 requests/10 min), registration, and podcast comments (5 comments/session).
* **Audio Token Issuance**: Mentors receive publisher tokens to broadcast audio; clients receive subscriber tokens to listen.
* **Automated Subscription Activation**: Cryptographically verified Stripe webhooks automatically update user records and grant plan access.
* **Moderation & Sanctioning**: Staff can warn users, delete flagged messages, or suspend accounts.

---

## Folder Structure

    backend/
    ├── config/             # Agora, Backblaze B2, Redis, and Stripe configs
    ├── controllers/        # Role controllers (Admin, Mentor, Auth, Chat, Podcast, Subscription)
    ├── middleware/         # Auth, role check, rate limiting
    ├── models/             # Database schemas
    ├── routes/             # Express API routes
    ├── Services/           # Email & notification service
    ├── utils/              # Socket handler, password validator, email helpers
    ├── Dockerfile          # Docker container configuration
    ├── package.json        # Dependencies and scripts
    └── server.js           # Server entry point & Socket.io setup

---

## Environment Configuration

Create a .env file in the root directory and configure the following variables:

    PORT=5000
    MONGO_URI=mongodb_connection_uri
    JWT_SECRET=jwt_secret_key
    CLIENT_URL=[http://13.60.72.235](http://13.60.72.235)

    # Redis
    REDIS_HOST=redis
    REDIS_PORT=6379
    REDIS_PASSWORD=redis_password

    # Agora
    AGORA_APP_ID=agora_app_id
    AGORA_APP_CERTIFICATE=agora_certificate

    # Stripe
    STRIPE_SECRET_KEY=stripe_secret_key
    STRIPE_WEBHOOK_SECRET=stripe_webhook_secret

    # Backblaze B2
    B2_KEY_ID=backblaze_key_id
    B2_APPLICATION_KEY=backblaze_application_key
    B2_BUCKET_NAME=bucket_name
    B2_ENDPOINT=s3_endpoint

    # Email (SMTP)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=email@gmail.com
    SMTP_PASS=email_app_password

---

## Deployment (AWS EC2)

The backend is deployed alongside Redis and the frontend on an AWS EC2 Ubuntu t3.micro instance using Docker Compose.

1. SSH into the server:
    ssh -i your-key.pem ubuntu@13.60.72.235

2. Clone the repository:
    git clone [https://github.com/Iqra-Mushtak/MindComfort.git](https://github.com/Iqra-Mushtak/MindComfort.git)
    cd MindComfort

3. Build and launch services:
    docker compose up -d --build

4. Check running containers:
    docker ps

---

## Project Information

* **Developer**: Iqra Mushtaq (Roll No: 089350 / Reg No: 2021-ks-98)
* **Project ID**: 22-KS-BSIT-35
* **Institution**: Department of Computer Science, Govt. Graduate College, Civil Lines, Sheikhupura (University of the Punjab)
