FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY consent.html /usr/share/nginx/html/consent.html
EXPOSE 80
