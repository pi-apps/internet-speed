# 🚀 Internet Speed Project

This repository contains the necessary code to set up and deploy an Internet Speed website. This project is written in **C#** **(ASP.NET Core)** and is optimized for deployment on cloud servers using **Docker** and **Docker Compose**.

![.NET 8](https://img.shields.io/badge/.NET-8-blueviolet?style=for-the-badge&logo=dotnet)
![Docker](https://img.shields.io/badge/Docker-blue?style=for-the-badge&logo=docker)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-blue?style=for-the-badge&logo=docker)

---

## 📋 Prerequisites

Before starting the deployment process, ensure the following tools are installed and correctly configured on your server:

* **Docker Engine:** [Docker Installation Guide](https://docs.docker.com/engine/install/)
* **Docker Compose:** [Docker Compose Installation Guide](https://docs.docker.com/compose/install/)
* **.NET 8 SDK and Runtime:** [Download .NET 8](https://learn.microsoft.com/en-us/dotnet/core/install/)

---

## ⚙️ Configuration (Important)

Before building the Docker images, it is **critical** to replace the following values in the respective files with your own server and domain information.

### 1. `docker-compose.yml` File

* **SSL Certificate Paths:** In the `volumes` section for the application service, you must map the actual paths of your SSL certificate files (e.g., `fullchain.crt` and `privkey.key`) on the host server to the paths inside the container.

    ```yaml
    volumes:
      - /root/example.crt:/https/example.crt:ro
      - /root/example.key:/https/example.key:ro
    ```

### 2. `InternetSpeed.Web/appsettings.json` File

* **SSL Certificate Paths:** Enter the paths that you mapped into the container in `docker-compose.yml` (e.g., `/https/fullchain.crt`) into the Kestrel settings.
* **API Key:** Enter the required API key (if any) in the corresponding field (Your-api-key).

    ```json
    "Certificate": {
      "Path": "/https/example.crt",
      "KeyPath": "/https/example.key"

    "PiNetwork": {
      "ApiKey": "Your-api-key"
    ```

### 3. `Dockerfile`

* **SSL Paths:** If there are any `COPY` commands or direct references to SSL paths within the `Dockerfile`, ensure they also match your configuration. (Often, these settings are managed in `docker-compose.yml` and `appsettings.json`, but it's essential to check this file as well).

> **Important Note:** Failure to set the SSL paths correctly will prevent the site from loading over HTTPS or cause the Docker container to fail upon execution.

---

## 🚀 Setup and Deployment

After you have correctly configured all values in the files above, open a terminal in the project's root directory (where the `docker-compose.yml` file is located) and run the following commands in order:

### 1. Build Docker Images

This command will download the .NET 8 image, build your project, and create the final image based on the `Dockerfile`.

```bash
docker-compose build
```
### 2. Run the Containers

This command will run your containers in detached mode (in the background) based on the `docker-compose.yml` settings.

```bash
docker-compose up -d
```

Congratulations! 🎉 Your website should now be accessible on the domain you configured.
