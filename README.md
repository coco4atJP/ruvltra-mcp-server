# RuvLTRA MCP Server

**並列 RuvLTRA 推論による高速・低コスト バイブコーディング**

Claude Code, Gemini CLI, Codex 等の AI Agent ツールから MCP (Model Context Protocol) を通じて [ruv/ruvltra-claude-code](https://huggingface.co/ruv/ruvltra-claude-code) モデルを並列実行し、SONA 自己改善を活用するサーバー。

---

## Architecture

```
  ┌────────────────────────────────────────────────┐
  │  AI Agent (Claude Code / Gemini CLI / Codex)   │
  │  ─ 指示塔: タスク分解・結果統合                  │
  └─────────────────────┬──────────────────────────┘
                        │ stdio (JSON-RPC 2.0)
                        ▼
  ┌────────────────────────────────────────────────┐
  │          RuvLTRA MCP Server                     │
  │  ┌──────────────────────────────────────────┐  │
  │  │  MCP Core (JSON-RPC / initialize / tools) │  │
  │  └──────────────────┬───────────────────────┘  │
  │                     │                          │
  │  ┌──────────────────▼───────────────────────┐  │
  │  │  Tool Handlers                            │  │
  │  │  code_generate / review / refactor / ...  │  │
  │  │  parallel_generate / swarm_review         │  │
  │  └──────────────────┬───────────────────────┘  │
  │                     │                          │
  │  ┌──────────────────▼───────────────────────┐  │
  │  │  Worker Pool (auto-scaling 2..8)          │  │
  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │  │
  │  │  │ W1  │ │ W2  │ │ W3  │ │ W4  │  ...   │  │
  │  │  │+SONA│ │+SONA│ │+SONA│ │+SONA│        │  │
  │  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘        │  │
  │  └─────┼───────┼───────┼───────┼────────────┘  │
  │        └───────┼───────┼───────┘               │
  │                ▼                                │
  │  ┌─────────────────────────────────┐           │
  │  │  Inference Engine               │           │
  │  │  Backend: RuvLLM / llama.cpp /  │           │
  │  │           HTTP endpoint / mock  │           │
  │  └─────────────────────────────────┘           │
  └────────────────────────────────────────────────┘
                        │
                        ▼
  ┌────────────────────────────────────────────────┐
  │  ruv/ruvltra-claude-code (0.5B, GGUF Q4_K_M)  │
  │  + SONA Self-Learning (EWC++ / MicroLoRA)      │
  └────────────────────────────────────────────────┘
```

## Key Concepts

| 概念 | 説明 |
|------|------|
| **指示塔モデル** | Claude Code / Gemini CLI / Codex がタスクを分解し、MCPツールを呼び出す |
| **並列実行** | Worker Pool が複数の RuvLTRA インスタンスを同時に動かし、スループットを最大化 |
| **SONA 自己改善** | 各 Worker が SONA エンジンを持ち、成功パターンを学習・保持 (EWC++ で忘却防止) |
| **RuvLLM バックエンド** | `@ruvector/ruvllm` で実行すると SONA の自己改善がネイティブに機能 |
| **低コスト** | 0.5B パラメータモデル (398MB) でローカル実行可能。GPU 不要でも動作 |

---

## Quick Start

### 1. Install

```bash
git clone <this-repo>
cd ruvltra-mcp-server
npm install
npm run build
```

### 2. Download Model (optional - mock mode available without model)

```bash
# Direct download
wget https://huggingface.co/ruv/ruvltra-claude-code/resolve/main/ruvltra-claude-code-0.5b-q4_k_m.gguf 
  -P ~/.ruvltra/models/

# Or via Python
pip install huggingface-hub
huggingface-cli download ruv/ruvltra-claude-code 
  ruvltra-claude-code-0.5b-q4_k_m.gguf 
  --local-dir ~/.ruvltra/models/
```

### 3. Configure AI Agent

#### Claude Code (`~/.claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "ruvltra": {
      "command": "node",
      "args": ["/path/to/ruvltra-mcp-server/dist/index.js"],
      "env": {
        "RUVLTRA_LOG_LEVEL": "info",
        "RUVLTRA_MAX_WORKERS": "4",
        "RUVLTRA_SONA_ENABLED": "true"
      }
    }
  }
}
```

#### Gemini CLI (`.gemini/settings.json`)

```json
{
  "mcpServers": {
    "ruvltra": {
      "command": "node",
      "args": ["/path/to/ruvltra-mcp-server/dist/index.js"],
      "env": {
        "RUVLTRA_MAX_WORKERS": "4"
      }
    }
  }
}
```

#### OpenAI Codex

```json
{
  "mcpServers": [
    {
      "name": "ruvltra",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/ruvltra-mcp-server/dist/index.js"]
      }
    }
  ]
}
```

### 4. Use with HTTP Endpoint (remote model server)

```bash
# Point to any OpenAI-compatible or llama.cpp server
export RUVLTRA_HTTP_ENDPOINT="http://localhost:8080/v1/chat/completions"
export RUVLTRA_HTTP_API_KEY="your-key"
export RUVLTRA_HTTP_FORMAT="openai"

node dist/index.js
```

---

## MCP Tools

### Code Tools

| Tool | Description |
|------|-------------|
| `ruvltra_code_generate` | Generate code from natural language description |
| `ruvltra_code_review` | Review code for bugs, security, performance, style |
| `ruvltra_code_refactor` | Refactor code while preserving functionality |
| `ruvltra_code_explain` | Explain complex code in detail |
| `ruvltra_code_test` | Generate test cases for code |
| `ruvltra_code_fix` | Fix bugs given code + error message |
| `ruvltra_code_complete` | Complete partial code from a prefix |
| `ruvltra_code_translate` | Translate code between languages |

### Parallel / Swarm Tools

| Tool | Description |
|------|-------------|
| `ruvltra_parallel_generate` | Generate multiple files concurrently |
| `ruvltra_swarm_review` | Multi-perspective parallel code review (security, performance, style, etc.) |

### Management Tools

| Tool | Description |
|------|-------------|
| `ruvltra_status` | Server status, worker pool metrics |
| `ruvltra_sona_stats` | SONA self-learning statistics |
| `ruvltra_scale_workers` | Manually scale worker pool |

---

## Inference Backends

The server supports multiple backends with automatic detection:

| Priority | Backend | Requirements | SONA Self-Learning |
|----------|---------|--------------|---------------------|
| 1 | HTTP Endpoint | `RUVLTRA_HTTP_ENDPOINT` env var | Application-level |
| 2 | llama.cpp | `llama-server` binary + GGUF model | Application-level |
| 3 | RuvLLM Native | `npm install @ruvector/ruvllm` | **Native (full)** |
| 4 | Mock | None (built-in) | Application-level |

### RuvLLM Native (recommended for self-improvement)

```bash
npm install @ruvector/ruvllm
```

When running through RuvLLM, the SONA self-learning system operates at the native level:
- **Trajectory Learning**: Successful coding sequences are captured and replayed
- **EWC++**: Elastic Weight Consolidation prevents catastrophic forgetting
- **MicroLoRA**: Lightweight adaptation without full fine-tuning
- **<0.05ms latency**: Real-time adaptation

---

## SONA Self-Learning

Each worker maintains its own SONA engine that:

1. **Extracts Patterns** from every prompt/response pair (language, task type, code structures)
2. **Scores Trajectories** based on success, token efficiency, and completion quality
3. **Adapts Patterns** via exponential moving average updates (MicroLoRA-like)
4. **Protects Memory** via EWC++ to prevent forgetting successful patterns
5. **Enhances Prompts** by injecting learned pattern hints into future requests
6. **Consolidates** periodically to prune low-value patterns

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RUVLTRA_MODEL_PATH` | `~/.ruvltra/models/...gguf` | Path to GGUF model file |
| `RUVLTRA_HTTP_ENDPOINT` | - | HTTP inference endpoint URL |
| `RUVLTRA_HTTP_API_KEY` | - | API key for HTTP endpoint |
| `RUVLTRA_HTTP_MODEL` | `ruvltra-claude-code` | Model name for HTTP endpoint |
| `RUVLTRA_HTTP_FORMAT` | auto | `openai` or `llama` |
| `RUVLTRA_MAX_WORKERS` | `8` | Maximum parallel workers |
| `RUVLTRA_MIN_WORKERS` | `2` | Minimum workers |
| `RUVLTRA_CONTEXT_LENGTH` | `4096` | Context window (tokens) |
| `RUVLTRA_GPU_LAYERS` | `-1` | GPU layers (-1 = all, 0 = CPU) |
| `RUVLTRA_THREADS` | `0` | CPU threads (0 = auto) |
| `RUVLTRA_MAX_TOKENS` | `512` | Default max generation tokens |
| `RUVLTRA_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `RUVLTRA_SONA_ENABLED` | `true` | Enable SONA self-learning |
| `RUVLTRA_CONFIG` | - | Path to config JSON file |
| `LLAMA_CPP_PATH` | - | Path to llama.cpp installation |

---

## Usage Pattern: Vibe Coding Acceleration

```
User: "APIサーバーをTypeScriptで作って"
           │
           ▼
  Claude Code (指示塔)
  ├── タスク分解:
  │   ├── server.ts     → ruvltra_parallel_generate
  │   ├── routes.ts     → (並列実行)
  │   ├── middleware.ts  → (並列実行)
  │   ├── types.ts      → (並列実行)
  │   └── tests/        → (並列実行)
  │
  ├── レビュー:
  │   └── 全ファイル    → ruvltra_swarm_review (3並列)
  │
  └── 結果統合 → User へ返却
```

The AI agent (Claude Code) acts as the **command tower** that:
1. Receives the user's high-level request
2. Breaks it down into parallelizable sub-tasks
3. Dispatches them to RuvLTRA workers via MCP tools
4. Consolidates results and presents them to the user

This architecture enables **10-50x faster** multi-file generation compared to sequential processing.

---

## Testing

```bash
# Build
npm run build

# Run integration tests
npx tsx tests/integration.test.ts
```

---

## Project Structure

```
ruvltra-mcp-server/
  src/
    index.ts                    # Entry point
    types.ts                    # All TypeScript interfaces
    core/
      mcp-server.ts             # MCP protocol handler (JSON-RPC/stdio)
    tools/
      definitions.ts            # MCP tool schemas
      handlers.ts               # Tool execution logic
    workers/
      worker-pool.ts            # Parallel worker orchestration
    ruvllm/
      inference-engine.ts       # Model inference (multi-backend)
      sona-engine.ts            # SONA self-learning engine
    config/
      defaults.ts               # Configuration management
    utils/
      logger.ts                 # Structured logging (stderr)
      event-bus.ts              # Internal event system
  examples/
    claude-code-config.json     # Claude Code MCP config
    gemini-cli-config.json      # Gemini CLI MCP config
    codex-config.json           # Codex MCP config
  tests/
    integration.test.ts         # Integration tests
  ruvltra.config.json           # Default server config
  ruvltra.config.schema.json    # JSON Schema for config
```