# CRM Care – Hệ thống CRM Chăm sóc Khách hàng

## 1. Giới thiệu dự án

CRM Care là hệ thống quản lý và chăm sóc khách hàng được xây dựng phục vụ học phần **Triển khai và Quản trị Hệ thống Phần mềm**.

Dự án triển khai ứng dụng CRM bằng Docker Compose, tích hợp PostgreSQL, Nginx, Prometheus, Grafana, Loki và Promtail để hỗ trợ quản lý khách hàng, giám sát hệ thống và thu thập nhật ký.

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Giao diện | HTML, CSS, EJS |
| Backend | Node.js, Express.js |
| Cơ sở dữ liệu | PostgreSQL 16 |
| Quản trị database | pgAdmin 4 |
| Reverse proxy | Nginx |
| Container | Docker, Docker Compose |
| Monitoring | Prometheus, Grafana |
| HTTP monitoring | Blackbox Exporter |
| Container metrics | cAdvisor |
| Logging | Loki, Promtail |
| Quản lý mã nguồn | Git, GitHub |

## 3. Chức năng hệ thống

**Quản lý khách hàng**
- Thêm, xem, cập nhật và xóa khách hàng.
- Tìm kiếm, lọc khách hàng theo thông tin và trạng thái.

**Quản lý người liên hệ**
- Thêm, xem, cập nhật và xóa người liên hệ.
- Liên kết người liên hệ với khách hàng.

**Quản lý tương tác**
- Ghi nhận lịch sử chăm sóc khách hàng.
- Hiển thị lịch sử theo dòng thời gian.
- Tìm kiếm, lọc và xóa tương tác.

**Dashboard**
- Giao diện tổng quan và điều hướng giữa các chức năng CRM.

## 4. Kiến trúc hệ thống

Hệ thống có 10 dịch vụ Docker:

1. `postgres` – Lưu trữ dữ liệu CRM.
2. `pgadmin` – Quản trị PostgreSQL.
3. `web` – Ứng dụng CRM Node.js.
4. `nginx` – Reverse proxy.
5. `blackbox` – Kiểm tra trạng thái HTTP.
6. `cadvisor` – Thu thập metrics môi trường Docker.
7. `prometheus` – Thu thập và lưu trữ metrics.
8. `grafana` – Hiển thị dashboard và tra cứu log.
9. `loki` – Lưu trữ log tập trung.
10. `promtail` – Thu thập log Docker gửi đến Loki.

Luồng ứng dụng chính:

Người dùng → Nginx → Node.js/Express → PostgreSQL

Luồng Monitoring:

Blackbox Exporter + cAdvisor → Prometheus → Grafana

Luồng Logging:

Docker Logs → Promtail → Loki → Grafana Explore

## 5. Hướng dẫn triển khai

### Yêu cầu

- Docker Desktop hoặc Docker Engine.
- Docker Compose.
- Git.
- Máy tính có đủ tài nguyên để chạy các container.

### Cấu hình môi trường

Sao chép `.env.example` thành `.env`:

`Copy-Item .env.example .env`

Chỉnh các giá trị `CHANGE_ME` thành mật khẩu phù hợp. Không đưa file `.env` lên GitHub.

### Khởi động

`docker compose up -d --build`

### Kiểm tra container

`docker compose ps`

### Kiểm tra log

`docker compose logs --tail=30 web`

### Dừng hệ thống

`docker compose down`

Không sử dụng `docker compose down -v` nếu muốn giữ dữ liệu database và dashboard.

## 6. Địa chỉ truy cập

| Dịch vụ | URL |
|---|---|
| CRM Web | http://localhost:8080 |
| Kiểm tra database | http://localhost:8080/health/db |
| pgAdmin | http://localhost:5050 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki readiness | http://localhost:3100/ready |

Các cổng được công bố trên máy host giới hạn ở địa chỉ `127.0.0.1`.

## 7. Monitoring

Dashboard Grafana: **CRM Care - System Monitoring**.

Các panel đã cấu hình:

- CRM Website Status.
- PostgreSQL Connection Status.
- CRM Response Time.
- Docker Environment Memory.
- Docker Environment CPU Usage.

Prometheus thu thập chỉ số HTTP qua Blackbox Exporter và thông tin tài nguyên qua cAdvisor.

Lưu ý: CPU và RAM được hiển thị hiện là dữ liệu tổng hợp của môi trường Docker, không phải chỉ số riêng của từng container.

## 8. Logging

Promtail thu thập log từ các container Docker và gửi đến Loki.

Sử dụng Grafana Explore, chọn nguồn dữ liệu Loki và chạy các truy vấn LogQL.

**Log Nginx:**

`{job="docker",service="nginx"}`

**Log Node.js CRM:**

`{job="docker",service="web"}`

**Log PostgreSQL:**

`{job="docker",service="postgres"}`

**Tìm log lỗi:**

`{job="docker"} |~ "(?i)error"`

Đã kiểm tra việc hiển thị log Nginx, Web và PostgreSQL trong Grafana Explore.

## 9. Hardening bảo mật

Các biện pháp triển khai:

- Chạy container Node.js bằng user `node`, không chạy root.
- Loại bỏ các Linux capabilities không cần thiết đối với Web.
- Bật `no-new-privileges`.
- Đặt root filesystem của Web ở chế độ chỉ đọc.
- Sử dụng vùng `/tmp` riêng.
- Giới hạn CPU, RAM và số tiến trình của Web.
- Nginx bổ sung các HTTP security headers.
- Sử dụng `.env` để tách thông tin cấu hình nhạy cảm khỏi Docker Compose.
- Sử dụng `.gitignore` để không đưa `.env` lên GitHub.
- Giới hạn các cổng xuất bản ở giao diện loopback.

**Giới hạn bảo mật:** Đây là hệ thống phục vụ học tập, chưa sẵn sàng triển khai công khai trên Internet. Cần bổ sung xác thực người dùng, phân quyền, HTTPS và quản lý secrets trước khi đưa vào môi trường thực tế.

## 10. Kiểm tra và minh chứng

Các minh chứng phục vụ bài thi:

- Docker Compose chạy 10 container.
- Giao diện CRM và chức năng CRUD.
- Kết nối PostgreSQL, pgAdmin.
- Nginx reverse proxy.
- Prometheus và Grafana dashboard.
- Loki và Promtail thu thập log.
- Web chạy non-root (`uid=1000`).
- Read-only filesystem (`true`).
- GitHub repository và lịch sử tối thiểu 3 commit.

## 11. Kết luận

Dự án CRM Care minh họa quy trình triển khai, quản trị, giám sát và tăng cường bảo mật cơ bản cho một ứng dụng web có cơ sở dữ liệu thông qua nền tảng Docker Compose.

Dự án được xây dựng nhằm mục đích học tập và thực hành.