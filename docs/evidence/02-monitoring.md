# Prometheus & Grafana Monitoring

## Thanh phan
- Prometheus thu thap metrics he thong.
- Grafana hien thi dashboard giam sat.
- Blackbox Exporter kiem tra tinh trang website va database qua health endpoints.
- cAdvisor cung cap metrics tai nguyen Docker.

## File cau hinh
- docker-compose.yml
- monitoring/prometheus/prometheus.yml
- monitoring/blackbox/blackbox.yml

## Huong dan kiem tra

1. Mo Prometheus:
   http://localhost:9090/targets

2. Kiem tra trang thai cac targets.

3. Mo Grafana:
   http://localhost:3001

4. Mo dashboard:
   CRM Care - System Monitoring

## Chi so theo doi
- Website Status
- PostgreSQL Connection Status
- CRM Response Time
- Docker Environment Memory
- Docker Environment CPU

## Minh chung can chup
1. Prometheus Targets.
2. Grafana Dashboard voi 5 panels.
3. Ket qua truy van probe_success trong Prometheus.

## Luu y
Health check PostgreSQL chi xac nhan ket noi database,
khong thay the giam sat chuyen sau bang postgres_exporter.

Metrics CPU/RAM hien tai co the la so lieu tong hop Docker,
khong nhat thiet tach rieng tung container.

Prometheus va Grafana da duoc trien khai trong commit ha tang
truoc do. Tai lieu nay bo sung huong dan kiem chung.
