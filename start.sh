#!/usr/bin/env bash
# ==============================================================================
# 🩺 MediDecode — Complete System Startup Script
# Starts both FastAPI Backend (Port 8102) and Expo Mobile Frontend (Port 8100)
# ==============================================================================

set -eo pipefail

# Determine script root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
MOBILE_DIR="$ROOT_DIR/mobile"

# ANSI Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Helper log functions
log_info()    { echo -e "${CYAN}ℹ [INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}✔ [OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}▲ [WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}✖ [ERROR]${NC} $*"; }
log_step()    { echo -e "\n${BOLD}${BLUE}==>${NC} ${BOLD}$*${NC}"; }

# Header banner
clear 2>/dev/null || true
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     🩺 MEDIDECODE APPLICATION STARTUP                    ║"
echo "║       AI-Powered Prescription Decoder & Medication Companion             ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Detect LAN IP
LAN_IP=""
if command -v ipconfig &>/dev/null; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [[ -z "$LAN_IP" ]] && command -v hostname &>/dev/null; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="127.0.0.1"
fi

# ------------------------------------------------------------------------------
# 1. Pre-flight Checks
# ------------------------------------------------------------------------------
log_step "Step 1: Checking System Dependencies & Environment"

# Check Python
if ! command -v python3 &>/dev/null; then
  log_error "Python 3 is required but was not found in PATH."
  exit 1
fi
PYTHON_VER=$(python3 --version 2>&1)
log_success "Found Python: ${PYTHON_VER}"

# Check Node.js
if ! command -v node &>/dev/null; then
  log_error "Node.js (v20+) is required but was not found in PATH."
  exit 1
fi
NODE_VER=$(node --version)
log_success "Found Node.js: ${NODE_VER}"

# Check Backend Virtualenv
if [[ -d "$BACKEND_DIR/.venv" ]]; then
  PYTHON_EXEC="$BACKEND_DIR/.venv/bin/python"
  log_success "Using backend virtualenv at backend/.venv"
else
  log_warn "backend/.venv not found. Falling back to system python3."
  PYTHON_EXEC="python3"
fi

# Check Backend .env & Gemini Key
if [[ -f "$BACKEND_DIR/.env" ]]; then
  if grep -q "GEMINI_API_KEY=" "$BACKEND_DIR/.env" && ! grep -q "your_.*_here" "$BACKEND_DIR/.env"; then
    log_success "Found configured GEMINI_API_KEY in backend/.env"
  else
    log_warn "GEMINI_API_KEY might be missing or using placeholder in backend/.env"
  fi
else
  log_warn "backend/.env file not found. Copying from .env.example..."
  if [[ -f "$BACKEND_DIR/.env.example" ]]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    log_info "Created backend/.env — please configure your GEMINI_API_KEY if not already set."
  fi
fi

# Check Mobile node_modules
if [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  log_info "mobile/node_modules missing. Installing npm packages..."
  (cd "$MOBILE_DIR" && npm install)
  log_success "Mobile dependencies installed."
fi

# ------------------------------------------------------------------------------
# 2. Port Management & Clean Start
# ------------------------------------------------------------------------------
log_step "Step 2: Managing Network Ports"

check_and_free_port() {
  local port=$1
  local name=$2
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    log_info "Port $port ($name) is currently occupied by PID(s): $pids"
    # Do not blindly kill if user already has it running, but notify
    log_info "Reusing or reconnecting to existing $name service on port $port."
  else
    log_success "Port $port is available for $name."
  fi
}

check_and_free_port 8102 "FastAPI Backend"
check_and_free_port 8100 "Expo Metro Server"

# ------------------------------------------------------------------------------
# 3. Launch Services
# ------------------------------------------------------------------------------
log_step "Step 3: Launching Services"

BACKEND_PID=""
EXPO_PID=""

cleanup() {
  echo -e "\n${YELLOW}⚠ Shutting down MediDecode services...${NC}"
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$EXPO_PID" ]] && kill -0 "$EXPO_PID" 2>/dev/null; then
    kill "$EXPO_PID" 2>/dev/null || true
  fi
  log_success "All services stopped cleanly. Have a great day!"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start Backend if not already responding
if curl -s http://127.0.0.1:8102/health | grep -q "status"; then
  log_success "FastAPI Backend is already running and healthy at http://127.0.0.1:8102"
else
  log_info "Starting FastAPI Backend server (port 8102)..."
  (
    cd "$BACKEND_DIR"
    exec "$PYTHON_EXEC" run.py
  ) &
  BACKEND_PID=$!

  # Wait for backend health check
  log_info "Waiting for backend to become ready..."
  RETRIES=20
  READY=0
  for ((i=1; i<=RETRIES; i++)); do
    if curl -s http://127.0.0.1:8102/health | grep -q "status"; then
      READY=1
      break
    fi
    sleep 0.5
  done

  if [[ $READY -eq 1 ]]; then
    log_success "FastAPI Backend is online and ready!"
  else
    log_error "Backend failed to start within 10 seconds. Check backend/.venv or run.py logs."
    exit 1
  fi
fi

# Print Network Overview
echo -e "\n${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🚀 MEDIDECODE SERVICES ACTIVE & READY${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}⚡ Backend (FastAPI):${NC}  ${CYAN}http://localhost:8102${NC}  ${DIM}(LAN: http://${LAN_IP}:8102)${NC}"
echo -e "  ${BOLD}🏥 Health Check:${NC}      ${CYAN}http://localhost:8102/health${NC}"
echo -e "  ${BOLD}📱 Mobile App (Expo):${NC}  ${CYAN}http://localhost:8100${NC}  ${DIM}(LAN: exp://${LAN_IP}:8100)${NC}"
echo -e "  ${BOLD}🌐 Web Version:${NC}        Press ${BOLD}'w'${NC} in the console below to open in browser"
echo -e "  ${BOLD}📲 Mobile Scan:${NC}        Scan the QR code with Expo Go (Android/iOS)"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Start Expo Mobile Server (Foreground so user sees interactive QR code and keys)
log_step "Step 4: Launching Expo Metro Bundler"
cd "$MOBILE_DIR"

# Ensure EXPO_PUBLIC_API_URL is properly set to LAN IP for physical device compatibility
export EXPO_PUBLIC_API_URL="http://${LAN_IP}:8102"
log_info "Set EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}"

# Launch Expo
npx expo start --port 8100

