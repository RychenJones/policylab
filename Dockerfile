FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ backend/
COPY frontend/ frontend/
RUN dotnet publish backend/TransportPolicy.csproj -c Release -o /out --no-self-contained
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out/ .
ENV ASPNETCORE_HTTP_PORTS=8080 DOTNET_EnableDiagnostics=0
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "TransportPolicy.dll"]
