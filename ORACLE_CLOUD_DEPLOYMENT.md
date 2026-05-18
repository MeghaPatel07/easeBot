# Oracle Cloud Always Free Deployment Guide

Deploy your easebot backend to Oracle Cloud's always-free tier (2 VMs, 1GB RAM each).

## Prerequisites
- Oracle Cloud account (sign up at oracle.com/cloud/free)
- SSH key pair generated
- Your backend code on GitHub or local

---

## Step 1: Create Oracle Cloud VM

1. **Log into Oracle Cloud Console**
2. Navigate to **Compute → Instances**
3. Click **Create Instance**

### Configuration:
- **Name:** easebot-backend
- **Image:** Ubuntu 22.04 (Minimal)
- **Shape:** Ampere (ARM) - Micro (1 OCPU, 1GB RAM) ✅ Always Free
- **Network:** Use default VCN
- **Public IP:** Assign (or use later)
- **SSH Key:** Upload your public key
- **Create**

**Note:** Wait 2-3 minutes for instance to start.

---

## Step 2: Connect to VM & Install Dependencies

```bash
# SSH into your instance (replace IP)
ssh -i your-private-key ubuntu@<INSTANCE_PUBLIC_IP>

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg (needed for your audio/video processing)
sudo apt-get install -y ffmpeg

# Install git
sudo apt-get install -y git

# Verify installations
node --version   # Should be v20.x
npm --version
ffmpeg -version
```

---

## Step 3: Deploy Your Backend

```bash
# Clone your repository (use HTTPS or SSH with key)
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/easebot.git
cd easebot/easebot-backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build succeeded
ls -la dist/server.js
```

---

## Step 4: Set Up Environment Variables

```bash
# Create .env file in easebot-backend directory
sudo nano .env
```

Add your environment variables:
```
# Firebase
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_email

# Azure OpenAI
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT_THEWEDDINGBOT=your_endpoint
AZURE_OPENAI_DEPLOYMENT_ID=your_deployment_id

# Server
PORT=8080
NODE_ENV=production

# Other services
POSTOG_API_KEY=your_key
DATABASE_URL=your_firebase_url
```

**Press Ctrl+O → Enter → Ctrl+X to save in nano**

---

## Step 5: Test Your Backend Locally

```bash
# Test if server runs
npm start

# Should see: "Server running on port 8080"
# Press Ctrl+C to stop
```

---

## Step 6: Set Up Process Manager (PM2)

Keep your server running permanently:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start your backend with PM2
cd /home/ubuntu/easebot/easebot-backend
pm2 start dist/server.js --name "easebot-backend"

# Make it start on reboot
pm2 startup
pm2 save

# Verify it's running
pm2 status
pm2 logs easebot-backend  # View logs
```

---

## Step 7: Configure Network Access

### Open Firewall Port 8080:

```bash
# Check current rules
sudo iptables -L

# Open port 8080
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Save iptables (persistent)
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

### Configure Oracle Cloud Security Group:

1. In Oracle Cloud Console → **Networking → Virtual Cloud Networks**
2. Select your VCN
3. **Security Lists** → Click the default one
4. **Add Ingress Rule:**
   - **Protocol:** TCP
   - **Source CIDR:** 0.0.0.0/0
   - **Destination Port Range:** 8080
   - **Action:** ALLOW

---

## Step 8: Verify Deployment

```bash
# From your local machine (replace IP)
curl http://<INSTANCE_PUBLIC_IP>:8080/health

# Or test specific endpoint
curl -X POST http://<INSTANCE_PUBLIC_IP>:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

---

## Step 9: Optional - Set Up Domain & SSL

### Using Nginx as Reverse Proxy:

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/easebot
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable config
sudo ln -s /etc/nginx/sites-available/easebot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL with Let's Encrypt (optional)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Step 10: Monitoring & Logs

```bash
# View PM2 logs
pm2 logs easebot-backend

# Monitor resources
pm2 monit

# View system logs
tail -f /var/log/syslog

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## Updating Your Code

When you push new changes to GitHub:

```bash
cd /home/ubuntu/easebot/easebot-backend

# Pull latest code
git pull origin main

# Rebuild
npm install
npm run build

# Restart server
pm2 restart easebot-backend

# Check status
pm2 logs easebot-backend
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 8080
sudo lsof -i :8080
# Kill it
sudo kill -9 <PID>
```

### PM2 Not Starting
```bash
pm2 delete easebot-backend
pm2 start dist/server.js --name "easebot-backend"
pm2 save
```

### Firebase Connection Issues
- Verify `.env` has correct credentials
- Check Firebase service account JSON format
- Ensure Firebase rules allow your backend IP

### FFmpeg Not Found
```bash
# Reinstall
sudo apt-get install -y ffmpeg
ffmpeg -version
```

---

## Cost Check (Always Free)
- 2 ARM VMs with 1GB RAM ✅ Free
- 200GB Block Storage ✅ Free
- 10GB Data Transfer ✅ Free (per month)
- No expiration ✅ Forever Free

**Total Cost: $0**

---

## Next Steps

1. Update your frontend to point to: `http://<INSTANCE_PUBLIC_IP>:8080`
2. Set up auto-backups for your code
3. Monitor performance with PM2 Plus (optional paid)
4. Consider adding a second VM for redundancy

Questions? Check `/var/log/syslog` for detailed error logs.
