# Mozelle Archive VPS 部署说明

本文以一台已绑定公网 IP 的 Linux VPS 为目标。最终结构为：Caddy 负责 HTTPS 与反向代理，Vinext 提供博客页面，Fastify 提供后台 API，PostgreSQL 保存文章，Docker Volume 保存数据库与上传图片。

## 1. 准备域名和服务器

1. 在域名服务商处添加一条 `A` 记录，把博客域名指向 VPS 的 IPv4 地址；有 IPv6 时再添加 `AAAA` 记录。
2. 在 VPS 防火墙和云服务商安全组中开放 TCP `22`、`80`、`443`，并开放 UDP `443` 以使用 HTTP/3。
3. 安装 Git、Docker Engine 和 Docker Compose 插件。安装完成后确认：

```bash
git --version
docker --version
docker compose version
```

只有 Caddy 的 80/443 端口会暴露到公网；PostgreSQL、API 和 Web 容器不会直接对公网开放端口。

## 2. 设置后台密码与可选的 GitHub 备用登录

后台默认使用 `ADMIN_PASSWORD` 登录。真实密码只写入 VPS 的 `.env`，不要提交到 GitHub。当前约定的密码请使用你在本次设计中指定的值；正式对公网开放前建议再换成更长的随机密码。

GitHub OAuth 现在只是备用入口，不配置也不影响密码登录。需要备用登录时再创建 OAuth App；它与 ChatGPT 的 GitHub 连接器不是同一个应用。

1. 登录作为管理员的 GitHub 账号。
2. 进入 `Settings → Developer settings → OAuth Apps → New OAuth App`。
3. 填写：
   - Application name：`Mozelle Archive Admin`
   - Homepage URL：`https://你的域名`
   - Authorization callback URL：`https://你的域名/api/auth/github/callback`
4. 创建后复制 `Client ID`，再生成一个 `Client secret`。密钥只放进 VPS 的 `.env`。
5. `ADMIN_GITHUB_ID` 使用数字账号 ID，而不是用户名。本项目模板已填入 `YuanChu0512` 对应的 `110559160`；如果以后更换管理员账号，需要修改它。

备用登录只请求 GitHub 的 `read:user` 权限，服务端会再次核对数字账号 ID。

## 3. 下载代码和填写环境变量

在 VPS 中执行：

```bash
git clone https://github.com/YuanChu0512/Mozelle-Journal.git
cd Mozelle-Journal
cp .env.example .env
nano .env
```

把 `.env` 中的域名、数据库密码与 `ADMIN_PASSWORD` 全部替换。若不使用 GitHub 备用登录，可以让 GitHub 三项保持为空。生成会话密钥：

```bash
openssl rand -hex 32
```

把输出完整填入 `SESSION_SECRET`。确保 `DOMAIN` 不带协议，而 `PUBLIC_ORIGIN` 必须带 `https://`，二者需要指向同一个域名。

建议限制环境文件权限：

```bash
chmod 600 .env
```

## 4. 首次启动

```bash
docker compose build
docker compose up -d
docker compose ps
```

首次启动时 API 会自动创建数据库表并写入四篇示例文章；Caddy 会在域名解析生效后自动申请证书。查看日志：

```bash
docker compose logs -f --tail=100
```

检查 API：

```bash
curl https://你的域名/api/health
```

返回包含 `"ok":true` 后，访问：

- 博客首页：`https://你的域名/`
- 控制后台：`https://你的域名/admin`

首次进入后台会显示密码验证界面。密码在 API 服务端校验，连续输错 5 次会锁定当前来源 IP 10 分钟；若配置了 GitHub OAuth，密码框下方还会显示备用入口。

## 5. 日常更新

确认仓库中的新版代码后，在 VPS 执行：

```bash
git pull --ff-only
docker compose build
docker compose up -d
docker image prune -f
```

数据库和上传图片位于独立 Docker Volume，重新构建容器不会删除内容。

## 6. 备份

创建备份目录：

```bash
mkdir -p backups
```

备份数据库：

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backups/database.sql.gz
```

备份图片：

```bash
docker run --rm -v mozelle_uploads_data:/data:ro -v "$PWD/backups":/backup alpine tar -czf /backup/uploads.tar.gz -C /data .
```

建议把 `backups` 目录定期复制到另一台机器或对象存储。执行 `docker compose down -v` 会删除数据卷，除非已经确认备份可恢复，否则不要使用 `-v`。

## 7. 常见检查

- GitHub 登录提示回调地址错误：检查 OAuth App 的 callback URL 与 `PUBLIC_ORIGIN` 是否完全一致。
- 登录成功但提示无权限：确认 `ADMIN_GITHUB_ID` 是管理员账号的数字 ID。
- 图片上传后重启消失：检查 `mozelle_uploads_data` 是否存在，以及 `api` 服务是否挂载 `/data/uploads`。
- Caddy 无法签发证书：确认 DNS 已生效、80/443 未被其他程序占用，且域名直接指向这台 VPS。
- 查看单个服务日志：`docker compose logs -f api`、`docker compose logs -f web` 或 `docker compose logs -f caddy`。
