# Loki + Promtail + LogQL

## Thanh phan
- Loki luu tru va truy van log.
- Promtail thu thap log tu cac container Docker.
- Grafana Explore dung de truy van LogQL.

## File cau hinh
- docker-compose.yml
- monitoring/loki/loki.yml
- monitoring/promtail/promtail.yml

## Kiem tra Loki
Mo:
http://localhost:3100/ready

## Kiem tra LogQL tren Grafana
1. Mo http://localhost:3001
2. Chon Explore.
3. Chon datasource Loki.
4. Chay lan luot 3 truy van duoi day.

### Truy van 1: Nginx
{job="docker",service="nginx"}

### Truy van 2: CRM Web
{job="docker",service="web"}

### Truy van 3: PostgreSQL
{job="docker",service="postgres"}

## Minh chung can chup
1. Trang thai Loki Ready.
2. Ket qua truy van log Nginx.
3. Ket qua truy van log CRM Web.
4. Ket qua truy van log PostgreSQL.

## Ghi chu
Loki va Promtail da duoc trien khai trong commit ha tang
truoc do. Tai lieu nay bo sung huong dan kiem chung.
