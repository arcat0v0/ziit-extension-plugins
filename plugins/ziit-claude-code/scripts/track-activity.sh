#!/usr/bin/env bash
#
# Ziit Time Tracker for Claude Code
# Receives hook events from Claude Code and sends heartbeats to Ziit
#

set -euo pipefail

# Configuration
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ziit"
CONFIG_FILE="$CONFIG_DIR/config.json"
OFFLINE_FILE="$CONFIG_DIR/offline_heartbeats.json"
LOG_FILE="$CONFIG_DIR/claude-code.log"

# Ensure config directory exists
mkdir -p "$CONFIG_DIR"

# Logging function
log() {
    echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

# Read configuration
read_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log "ERROR: Config file not found at $CONFIG_FILE"
        log "Please create it with: {\"apiKey\": \"your-uuid-key\", \"baseUrl\": \"https://ziit.app\"}"
        exit 0  # Exit gracefully to not break Claude Code
    fi
    
    API_KEY=$(jq -r '.apiKey // empty' "$CONFIG_FILE" 2>/dev/null || echo "")
    BASE_URL=$(jq -r '.baseUrl // "https://ziit.app"' "$CONFIG_FILE" 2>/dev/null || echo "https://ziit.app")
    
    if [[ -z "$API_KEY" ]]; then
        log "ERROR: API key not configured in $CONFIG_FILE"
        exit 0
    fi
}

# Detect language from file extension
detect_language() {
    local file="$1"
    local ext="${file##*.}"
    
    case "$ext" in
        ts|tsx) echo "typescript" ;;
        js|jsx|mjs|cjs) echo "javascript" ;;
        py|pyw) echo "python" ;;
        rs) echo "rust" ;;
        go) echo "go" ;;
        rb) echo "ruby" ;;
        java) echo "java" ;;
        kt|kts) echo "kotlin" ;;
        swift) echo "swift" ;;
        c) echo "c" ;;
        cpp|cc|cxx|hpp) echo "cpp" ;;
        cs) echo "csharp" ;;
        php) echo "php" ;;
        sh|bash|zsh) echo "shell" ;;
        sql) echo "sql" ;;
        html|htm) echo "html" ;;
        css|scss|sass|less) echo "css" ;;
        json) echo "json" ;;
        yaml|yml) echo "yaml" ;;
        xml) echo "xml" ;;
        md|markdown) echo "markdown" ;;
        vue) echo "vue" ;;
        svelte) echo "svelte" ;;
        astro) echo "astro" ;;
        prisma) echo "prisma" ;;
        graphql|gql) echo "graphql" ;;
        toml) echo "toml" ;;
        ini|cfg) echo "ini" ;;
        dockerfile|Dockerfile) echo "dockerfile" ;;
        *) echo "unknown" ;;
    esac
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*) echo "Linux" ;;
        Darwin*) echo "macOS" ;;
        CYGWIN*|MINGW*|MSYS*) echo "Windows" ;;
        *) echo "Unknown" ;;
    esac
}

# Get project name from directory
detect_project() {
    local cwd="$1"
    
    # Try to get project name from git remote
    if command -v git &>/dev/null && [[ -d "$cwd/.git" || -f "$cwd/.git" ]]; then
        local remote_url
        remote_url=$(git -C "$cwd" remote get-url origin 2>/dev/null || echo "")
        if [[ -n "$remote_url" ]]; then
            # Extract repo name from URL
            local repo_name
            repo_name=$(basename -s .git "$remote_url" 2>/dev/null || echo "")
            if [[ -n "$repo_name" ]]; then
                echo "$repo_name"
                return
            fi
        fi
    fi
    
    # Fall back to directory name
    basename "$cwd"
}

# Get current git branch
detect_branch() {
    local cwd="$1"
    
    if command -v git &>/dev/null; then
        git -C "$cwd" branch --show-current 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Send heartbeat to Ziit
send_heartbeat() {
    local timestamp="$1"
    local project="$2"
    local language="$3"
    local file="$4"
    local branch="$5"
    
    local payload
    payload=$(jq -n \
        --arg timestamp "$timestamp" \
        --arg project "$project" \
        --arg language "$language" \
        --arg editor "Claude Code" \
        --arg os "$(detect_os)" \
        --arg file "$file" \
        --arg branch "$branch" \
        '{
            timestamp: $timestamp,
            project: $project,
            language: $language,
            editor: $editor,
            os: $os,
            file: $file,
            branch: (if $branch == "" then null else $branch end)
        }')
    
    log "Sending heartbeat: $payload"
    
    local response
    local http_code
    
    # Send request and capture both response and status code
    response=$(curl -s --max-time 5 -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$BASE_URL/api/external/heartbeat" 2>/dev/null || echo -e "\n000")
    
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        log "Heartbeat sent successfully"
        return 0
    else
        log "Failed to send heartbeat (HTTP $http_code): $response"
        # Queue for offline sync
        queue_offline_heartbeat "$payload"
        return 1
    fi
}

# Queue heartbeat for offline sync
queue_offline_heartbeat() {
    local payload="$1"
    
    # Initialize offline file if needed
    if [[ ! -f "$OFFLINE_FILE" ]]; then
        echo "[]" > "$OFFLINE_FILE"
    fi
    
    # Append to offline queue
    local temp_file
    temp_file=$(mktemp)
    jq ". += [$payload]" "$OFFLINE_FILE" > "$temp_file" && mv "$temp_file" "$OFFLINE_FILE"
    
    log "Queued heartbeat for offline sync"
}

# Sync offline heartbeats
sync_offline_heartbeats() {
    if [[ ! -f "$OFFLINE_FILE" ]]; then
        return 0
    fi
    
    local count
    count=$(jq 'length' "$OFFLINE_FILE" 2>/dev/null || echo "0")
    
    if [[ "$count" == "0" || "$count" == "null" ]]; then
        return 0
    fi
    
    log "Syncing $count offline heartbeats..."
    
    local payload
    payload=$(cat "$OFFLINE_FILE")
    
    local response
    local http_code
    
    response=$(curl -s --max-time 10 -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$BASE_URL/api/external/batch" 2>/dev/null || echo -e "\n000")
    
    http_code=$(echo "$response" | tail -n1)
    
    if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
        log "Offline heartbeats synced successfully"
        echo "[]" > "$OFFLINE_FILE"
    else
        log "Failed to sync offline heartbeats (HTTP $http_code)"
    fi
}

# Main function
main() {
    # Read hook input from stdin
    local input
    input=$(cat)
    
    log "Received hook event: $input"
    
    # Parse input JSON
    local hook_event tool_name tool_input cwd file_path
    
    hook_event=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")
    tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
    cwd=$(echo "$input" | jq -r '.cwd // empty' 2>/dev/null || echo "")
    
    # Extract file path based on tool type
    case "$tool_name" in
        Edit|MultiEdit)
            file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null || echo "")
            ;;
        Write)
            file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null || echo "")
            ;;
        *)
            # For Stop events or other tools, try to get from session
            file_path=""
            ;;
    esac
    
    # Skip if no file path and not a meaningful event
    if [[ -z "$file_path" && "$hook_event" != "Stop" ]]; then
        log "No file path found, skipping heartbeat"
        exit 0
    fi
    
    # Read configuration
    read_config
    
    # Sync any offline heartbeats first (in background)
    sync_offline_heartbeats &
    
    # Skip heartbeat for Stop events without file context
    if [[ -z "$file_path" ]]; then
        log "Stop event without file context, skipping"
        exit 0
    fi
    
    # Detect metadata
    local timestamp project language branch
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    project=$(detect_project "${cwd:-$(pwd)}")
    language=$(detect_language "$file_path")
    branch=$(detect_branch "${cwd:-$(pwd)}")
    
    # Send heartbeat
    send_heartbeat "$timestamp" "$project" "$language" "$file_path" "$branch"
}

# Run main
main
