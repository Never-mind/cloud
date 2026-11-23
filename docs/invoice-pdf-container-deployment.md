# 带浏览器的发票 PDF 部署包

这套部署将应用、Node 24、Chromium、中文字体和 Linux 运行库装入同一个 Docker 镜像。浏览器在构建时安装，正式开票时不再下载。无需在宿主机单独装 Chrome，也无需填写浏览器路径。现有 PM2 方式仍可使用；采用本方案时，应用改由 Docker 守护。

4 核 8G 可以作为当前系统与少量并发 PDF 转换的起点，实际容量取决于并发量。还需确认服务器支持 Docker Engine 和 Compose v2、有足够磁盘空间，并在构建时能访问 Node 镜像、npm 锁文件对应仓库和 Debian 软件源。4 核 8G 的购买信息不能确定操作系统与 CPU 架构。本镜像基于 Debian，适用于该基础镜像及 Chromium 软件源支持的 Linux amd64/arm64；其他架构需单独验证。

## 1. 首次部署准备

在生产服务器项目目录保留原 `.env.local`（数据库、飞书、Frappe、OBS 等配置）。该文件作为只读文件挂载，不进入镜像，包含 `$` 的密码也不会被 Compose 插值。浏览器路径由容器统一设为 `/usr/bin/chromium`，无需沿用 Windows 路径。

如果某些业务配置只写在原 PM2 的环境中，切换前也要移入生产 `.env.local`；容器不会继承原 PM2 进程的环境变量。原来使用 `DB_HOST=localhost` 的部署须改为容器能访问的数据库地址；当前生产库使用独立远程地址，可以继续沿用。

容器以 `node` 用户（UID/GID 1000）运行，需要读取 `.env.local`，并读写 `uploads/`。部署人员应按服务器既有权限方式授予该 UID 最小权限，不要将配置文件改成所有人可读。若原来有 `uploads/` 历史文件，完整保留并挂载同一目录；没有则先创建目录。OBS、数据库内附件仍沿用原配置。

```bash
docker version
docker compose version
test -f .env.local
mkdir -p uploads
docker compose build --pull cloud-power
```

镜像构建会用最终容器用户执行一次真实 PDF 转换；失败则终止构建。构建过程不读取生产 `.env.local`，不连接生产数据库、不执行迁移或同步。软件包版本由锁文件约束；Node/Chromium 安全更新在重新构建镜像时获取。

构建后验证运行配置与挂载权限（不会启动应用或自动同步）：

```bash
docker compose run --rm --no-deps cloud-power node -e "const fs=require('node:fs'); fs.accessSync('.env.local',fs.constants.R_OK); fs.accessSync('uploads',fs.constants.R_OK|fs.constants.W_OK); console.log('runtime files readable/writable')"
```

容器启动入口先调用与应用相同的 PDF 转换器，只有转换成功才继续运行命令。普通生产启动日志应出现 `[invoice-pdf-check]` 和 `status: ok`。

## 2. 从 PM2 切换

先保留原 PM2 配置与已构建版本，完成上述构建及自检。可先在临时端口检查页面，关闭所有自动同步和登录触发同步，避免与 PM2 服务同时运行后台任务：

```bash
docker compose run --rm --no-deps -p 127.0.0.1:3001:3000 \
  -e FEISHU_INVOICE_AUTO_SYNC=0 \
  -e FEISHU_PAYMENT_AUTO_SYNC=0 \
  -e FRAPPE_DEMAND_AUTO_SYNC=0 \
  -e FRAPPE_DEMAND_SYNC_ON_LOGIN=0 \
  cloud-power
```

另一个终端检查 `curl -I http://127.0.0.1:3001/login`，通过后 Ctrl+C 结束临时容器。随后在维护窗口执行：

```bash
pm2 stop cloud_power
docker compose up -d --no-build --wait cloud-power
docker compose logs --tail=80 cloud-power
```

默认使用 `127.0.0.1:3000`，适合原 Nginx 代理同一服务器的 3000 端口。若原 Nginx 使用其他端口，启动 Compose 时设置 `CLOUD_HTTP_PORT` 为该端口；不要在容器内把 Next 绑定到 `127.0.0.1`。Nginx 在另一容器内的情况需单独调整网络和 upstream。

确认正式网站登录、已有发票 PDF 下载及自动同步日志正常。Compose 健康检查只验证登录页返回 200，不代替数据库/外部接口验收。切换确认后，将旧 PM2 进程维持停止并用 `pm2 save` 保存状态，避免主机重启后旧进程与容器重复执行同步。

如需回退，先停止容器，再恢复原 PM2 服务：

```bash
docker compose stop cloud-power
pm2 restart cloud_power --update-env
pm2 save
```

## 3. 后续更新

```bash
git pull --ff-only
docker compose build --pull cloud-power
docker compose up -d --no-build --wait cloud-power
docker compose logs --tail=80 cloud-power
```

不再需要在服务器执行 `npm ci`、`npm run build` 或安装浏览器；镜像构建已完成这些步骤。数据库保持外置，`.env.local`、`uploads/` 保留，不执行数据初始化。保持单个应用服务实例，避免重复自动同步。

## 4. 由部署同事直接拿完整镜像上线

也可以在 CI / 构建机提前构建与生产 CPU 架构匹配的镜像，再通过公司镜像仓库传输，或用 `docker save` / `docker load` 离线传输。生产服务器只需 Docker、`compose.yaml`、生产 `.env.local` 和已有 `uploads/`，不需要访问 npm/浏览器下载站。

以下用 `cloud-power:release-20261123` 举例，实际使用不可混淆的发布标签：

```bash
# 构建机：架构须与生产服务器一致
docker build --pull -t cloud-power:release-20261123 .
docker save -o cloud-power-release-20261123.tar cloud-power:release-20261123

# 生产服务器：收到 tar、compose.yaml 后
docker load -i cloud-power-release-20261123.tar
CLOUD_IMAGE=cloud-power:release-20261123 docker compose up -d --no-build --wait cloud-power
```

旧 PM2 服务仍在运行时，先按第 2 节完成切换。保留上个镜像发布标签作为回滚版本。正式服务器不需要额外的浏览器下载；镜像本身会比纯代码包更大，首次构建/传输需要更多时间和流量。

## 验证状态

当前 Windows 工作区已验证同一 PDF 转换器能实际生成 `%PDF-` 文件。工作区没有可用 Docker 引擎，因此尚未宣称完成 Linux 镜像构建或正式网站验收；首次上线必须执行上述镜像构建、自检和网站下载验证。
