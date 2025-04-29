FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER root
WORKDIR /app
EXPOSE 80
EXPOSE 443

RUN mkdir -p /https && chmod -R 777 /https


FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["InternetSpeed.Web/InternetSpeed.Web.csproj", "InternetSpeed.Web/"]
COPY ["InternetSpeed.Core/InternetSpeed.Core.csproj", "InternetSpeed.Core/"]
COPY ["InternetSpeed.DataLayer/InternetSpeed.DataLayer.csproj", "InternetSpeed.DataLayer/"]
RUN dotnet restore "./InternetSpeed.Web/InternetSpeed.Web.csproj"
COPY . .
WORKDIR "/src/InternetSpeed.Web"
RUN dotnet build "./InternetSpeed.Web.csproj" -c $BUILD_CONFIGURATION -o /app/build


FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./InternetSpeed.Web.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false


FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .


ENV ASPNETCORE_Kestrel__Certificates__Default__Path=/https/example.crt
ENV ASPNETCORE_Kestrel__Certificates__Default__KeyPath=/https/example.key

ENTRYPOINT ["dotnet", "InternetSpeed.Web.dll"]