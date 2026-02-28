# RuvLTRA MCP Server

[English](#english-current-version) | [日本語 (Japanese)](#日本語-japanese)

`ruv/ruvltra-claude-code` を Claude Code / Gemini CLI / Codex などの指示塔エージェントから MCP 経由で並列活用するためのサーバーです。  
現行実装は「並列生成」だけでなく、運用向けの耐障害性（timeout, backpressure, retry, circuit breaker, SONA永続化）まで含めています。

---

## 日本語 (Japanese)

RuvLTRA MCP Server は、大規模言語モデル (LLM) を MCP (Model Context Protocol) 経由で並列実行し、堅牢な生成パイプラインを提供するサーバーです。

### 主な機能

- **13種類の MCP ツール**: `code_*` (生成、レビュー、リファクタ、翻訳など), `parallel_generate`, `swarm_review` など
- **WorkerPool の動的スケーリング**: 負荷に応じたワーカーの自動増減 (2〜8) とバックプレッシャー制御
- **耐障害性 (Resilience)**: タスクごとのタイムアウト、再試行 (Retry)、サーキットブレーカーによる安定稼働
- **4段階の推論フォールバック**: HTTP → llama.cpp → RuvLLM → Mock の順で自動切り替え
- **SONA 永続化**: ワーカーごとの自己改善パターンの保存と再ロード
- **MCP `outputSchema` + `structuredContent`**: 安定した機械解析のための構造化出力

### アーキテクチャ概要

```
  Claude Code / Gemini CLI / Codex (指示塔)
                   |
             stdio JSON-RPC
                   v
  +-------------------------------------------+
  | MCP Server Core (13ツール)                |
  |  - 並列生成 / スウォーム・レビュー        |
  |                                           |
  | Worker Pool (動的スケール 2..8)           |
  |  - キュー管理 / タイムアウト制御          |
  |                                           |
  | 推論エンジン (フォールバック制御)         |
  |  HTTP → llama.cpp → RuvLLM → Mock         |
  +-------------------------------------------+
```

### クイックスタート

#### npx で即座に利用する (推奨)

```bash
npx -y ruvltra-mcp-server
```

#### ソースからビルドする

```bash
npm install
npm run build
node dist/index.js
```

モックバックエンドが標準で動作します。実際の LLM 推論を使用するには、以下のいずれかの環境変数を設定してください。

| 方式 | 環境変数 | 説明 |
|---|---|---|
| HTTP | `RUVLTRA_HTTP_ENDPOINT` | OpenAI 互換 / llama.cpp HTTP エンドポイント |
| ローカルモデル | `RUVLTRA_MODEL_PATH` | GGUF モデルファイルのパス (`node-llama-cpp`) |
| RuvLLM | `@ruvector/ruvllm` | RuvLLM ランタイム |

### MCP ツール一覧 (13種)

#### コード操作ツール

| ツール名 | 説明 |
|---|---|
| `ruvltra_code_generate` | 指示とコンテキストからコードを生成 |
| `ruvltra_code_review` | コードのバグ・セキュリティ・パフォーマンスをレビュー |
| `ruvltra_code_refactor` | 動作を保持しつつコードをリファクタリング |
| `ruvltra_code_explain` | コードの説明を生成 |
| `ruvltra_code_test` | コードに対するテストを生成 |
| `ruvltra_code_fix` | エラー情報からコードを修正 |
| `ruvltra_code_complete` | プレフィックス/サフィックスからコードを補完 |
| `ruvltra_code_translate` | プログラミング言語間でコードを翻訳 |

#### 並列・スウォームツール

| ツール名 | 説明 |
|---|---|
| `ruvltra_parallel_generate` | ワーカープール経由で複数ファイルを並列生成 |
| `ruvltra_swarm_review` | 最大8つの視点から並列コードレビューを実行 |

#### 管理ツール

| ツール名 | 説明 |
|---|---|
| `ruvltra_status` | サーバー・ワーカー・バックエンドの状態を取得 |
| `ruvltra_sona_stats` | SONA 学習統計を取得 |
| `ruvltra_scale_workers` | ワーカープールのサイズを動的に変更 |

すべてのツールは `outputSchema` を定義し、`structuredContent` で構造化された応答を返します。

### MCP クライアント設定例

#### Claude Desktop / Claude Code

`~/.claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ruvltra": {
      "command": "npx",
      "args": ["-y", "ruvltra-mcp-server"],
      "env": {
        "RUVLTRA_MIN_WORKERS": "2",
        "RUVLTRA_MAX_WORKERS": "4"
      }
    }
  }
}
```

#### VS Code / Cursor (Antigravity 等)

`mcp_config.json`

```json
{
  "mcpServers": {
    "ruvltra-mcp-server": {
      "command": "npx",
      "args": ["-y", "ruvltra-mcp-server"]
    }
  }
}
```

### テスト

```bash
# 全テストスイート実行
npm test

# 個別テスト
npm run test:smoke       # MCP スモークテスト
npm run test:pool        # タイムアウト・バックプレッシャー
npm run test:resilience  # HTTP リトライ・サーキットブレーカー
npm run test:sona        # SONA 永続化
npm run test:parallel    # 並列生成
```

### 環境変数一覧

| 変数名 | デフォルト | 説明 |
|---|---:|---|
| `RUVLTRA_MIN_WORKERS` | `2` | 最小ワーカー数 |
| `RUVLTRA_MAX_WORKERS` | `8` | 最大ワーカー数 |
| `RUVLTRA_INITIAL_WORKERS` | `2` | 初期ワーカー数 |
| `RUVLTRA_QUEUE_MAX_LENGTH` | `256` | キュー最大長 |
| `RUVLTRA_TASK_TIMEOUT_MS` | `60000` | タスクタイムアウト (ms) |
| `RUVLTRA_SONA_ENABLED` | `true` | SONA 有効化 |
| `RUVLTRA_SONA_STATE_DIR` | `./.ruvltra-state/sona` | SONA 状態ディレクトリ |
| `RUVLTRA_SONA_PERSIST_INTERVAL` | `10` | 永続化間隔 (インタラクション数) |
| `RUVLTRA_HTTP_ENDPOINT` | - | HTTP 推論エンドポイント |
| `RUVLTRA_HTTP_API_KEY` | - | HTTP API キー |
| `RUVLTRA_HTTP_MODEL` | `ruvltra-claude-code` | HTTP モデル名 |
| `RUVLTRA_HTTP_FORMAT` | `auto` | `openai` / `llama` |
| `RUVLTRA_HTTP_TIMEOUT_MS` | `15000` | HTTP タイムアウト |
| `RUVLTRA_HTTP_MAX_RETRIES` | `2` | HTTP リトライ回数 |
| `RUVLTRA_HTTP_RETRY_BASE_MS` | `250` | リトライ間隔ベース |
| `RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD` | `5` | サーキット開放閾値 |
| `RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS` | `30000` | サーキットクールダウン |
| `RUVLTRA_MODEL_PATH` | 自動探索 | ローカル GGUF モデルパス |
| `RUVLTRA_CONTEXT_LENGTH` | `4096` | コンテキスト長 |
| `RUVLTRA_GPU_LAYERS` | `-1` | llama.cpp GPU レイヤー数 |
| `RUVLTRA_THREADS` | `0` | llama.cpp スレッド数 (0=自動) |
| `RUVLTRA_MAX_TOKENS` | `512` | 最大生成トークン数 |
| `RUVLTRA_TEMPERATURE` | `0.2` | 生成温度 |
| `RUVLTRA_MOCK_LATENCY_MS` | `120` | モックバックエンドのレイテンシ |
| `RUVLTRA_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `RUVLTRA_CONFIG` | - | JSON 設定ファイルパス |
| `LLAMA_CPP_PATH` | - | llama.cpp パスヒント |

---

## English (Current Version)


## Architecture

```
  Claude Code / Gemini CLI / Codex (Command Tower)
                   |
             stdio JSON-RPC
                   v
  +-------------------------------------------+
  | MCP Server Core                           |
  |  - ListTools / CallTool                   |
  |  - outputSchema + structuredContent       |
  |                                           |
  | Tool Handlers (13 tools)                  |
  |  - code_* / parallel_generate / swarm_*   |
  |                                           |
  | Worker Pool (auto-scale 2..8)             |
  |  - queue backpressure                     |
  |  - per-task timeout + cancellation        |
  |  - worker-local SONA                      |
  |                                           |
  | Inference Engine (4-stage fallback)       |
  |  HTTP -> llama.cpp -> RuvLLM -> Mock      |
  |  + HTTP retry/timeout/circuit breaker     |
  +-------------------------------------------+
```

---

## Key Features

- 13 MCP tools (`code_*`, `parallel_generate`, `swarm_review`, management)
- WorkerPool auto-scaling (`min..max`) with queue backpressure
- Per-task timeout and cancellation (`AbortController` based)
- 4-stage inference fallback with automatic recovery to higher-priority backends
- HTTP robustness: timeout, retry, circuit breaker (`open/half_open/closed`)
- SONA self-improvement per worker with disk persistence and reload
- MCP `outputSchema` + `structuredContent` support for stable machine parsing

---

## Quick Start

```bash
npm install
npm run build
npm test
```

Run server:

```bash
node dist/index.js
```

Mock backend works out of the box.  
To use real inference, set at least one backend:

- `RUVLTRA_HTTP_ENDPOINT` (OpenAI-compatible or llama.cpp HTTP)
- or `RUVLTRA_MODEL_PATH` (GGUF for `node-llama-cpp`)
- or install/use `@ruvector/ruvllm`

---

## MCP Client Config Example (Claude Code)

`~/.claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ruvltra": {
      "command": "node",
      "args": ["/path/to/ruvltra-mcp-server/dist/index.js"],
      "env": {
        "RUVLTRA_MIN_WORKERS": "2",
        "RUVLTRA_MAX_WORKERS": "4",
        "RUVLTRA_TASK_TIMEOUT_MS": "60000",
        "RUVLTRA_QUEUE_MAX_LENGTH": "256",
        "RUVLTRA_LOG_LEVEL": "info"
      }
    }
  }
}
```

---

## MCP Tools (13)

### Code tools

- `ruvltra_code_generate`
- `ruvltra_code_review`
- `ruvltra_code_refactor`
- `ruvltra_code_explain`
- `ruvltra_code_test`
- `ruvltra_code_fix`
- `ruvltra_code_complete`
- `ruvltra_code_translate`

### Parallel / swarm

- `ruvltra_parallel_generate`
- `ruvltra_swarm_review`

### Management

- `ruvltra_status`
- `ruvltra_sona_stats`
- `ruvltra_scale_workers`

All tools now define `outputSchema` and return `structuredContent` (plus `content.text` for compatibility).

---

## Tool I/O Contract Notes

- Optional `timeoutMs` is accepted by all generation/review style tools.
- Management tools return structured status/stats objects.
- `ruvltra_status` includes queue metrics and backend/circuit state.

Example `structuredContent` (`ruvltra_code_generate`):

```json
{
  "output": "...",
  "workerId": "worker-2",
  "backend": "http",
  "model": "ruvltra-claude-code",
  "latencyMs": 184,
  "taskId": "task-173..."
}
```

---

## Reliability and Operations

### Queue and backpressure

- `RUVLTRA_QUEUE_MAX_LENGTH` overrun is rejected with a queue overflow error.
- Status tracks: `rejectedTasks`, `queueLength`, `inFlight`.

### Timeout and cancellation

- Per-task timeout via `RUVLTRA_TASK_TIMEOUT_MS` or per-tool `timeoutMs`.
- Timeout triggers cancellation and immediate task failure.

### HTTP resilience

- `RUVLTRA_HTTP_TIMEOUT_MS`
- `RUVLTRA_HTTP_MAX_RETRIES`
- `RUVLTRA_HTTP_RETRY_BASE_MS`
- `RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD`
- `RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS`

Circuit opens after consecutive failures, then probes again after cooldown.

### SONA persistence

- `RUVLTRA_SONA_STATE_DIR` (default: `./.ruvltra-state/sona`)
- `RUVLTRA_SONA_PERSIST_INTERVAL` (interactions per flush)

---

## Environment Variables

| Variable | Default | Description |
|---|---:|---|
| `RUVLTRA_MIN_WORKERS` | `2` | Minimum worker count |
| `RUVLTRA_MAX_WORKERS` | `8` | Maximum worker count |
| `RUVLTRA_INITIAL_WORKERS` | `2` | Initial worker count |
| `RUVLTRA_QUEUE_MAX_LENGTH` | `256` | Max queued tasks before backpressure |
| `RUVLTRA_TASK_TIMEOUT_MS` | `60000` | Default per-task timeout |
| `RUVLTRA_SONA_ENABLED` | `true` | Enable SONA |
| `RUVLTRA_SONA_STATE_DIR` | `./.ruvltra-state/sona` | SONA state directory |
| `RUVLTRA_SONA_PERSIST_INTERVAL` | `10` | Persist every N interactions |
| `RUVLTRA_HTTP_ENDPOINT` | - | HTTP inference endpoint |
| `RUVLTRA_HTTP_API_KEY` | - | HTTP API key |
| `RUVLTRA_HTTP_MODEL` | `ruvltra-claude-code` | HTTP model name |
| `RUVLTRA_HTTP_FORMAT` | `auto` | `openai` or `llama` |
| `RUVLTRA_HTTP_TIMEOUT_MS` | `15000` | HTTP timeout |
| `RUVLTRA_HTTP_MAX_RETRIES` | `2` | HTTP retry count |
| `RUVLTRA_HTTP_RETRY_BASE_MS` | `250` | Retry backoff base |
| `RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures before opening circuit |
| `RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS` | `30000` | Circuit cooldown |
| `RUVLTRA_MODEL_PATH` | auto-search | Local GGUF model path |
| `RUVLTRA_CONTEXT_LENGTH` | `4096` | Context tokens |
| `RUVLTRA_GPU_LAYERS` | `-1` | llama.cpp GPU layers |
| `RUVLTRA_THREADS` | `0` | llama.cpp thread count (0=auto) |
| `RUVLTRA_MAX_TOKENS` | `512` | Default max generation tokens |
| `RUVLTRA_TEMPERATURE` | `0.2` | Default temperature |
| `RUVLTRA_MOCK_LATENCY_MS` | `120` | Mock backend latency |
| `RUVLTRA_LOG_LEVEL` | `info` | `debug/info/warn/error` |
| `RUVLTRA_CONFIG` | - | Optional JSON config file |
| `LLAMA_CPP_PATH` | - | Optional llama.cpp path hint |

---

## Testing

```bash
# full suite
npm test

# targeted
npm run test:smoke
npm run test:pool
npm run test:resilience
npm run test:sona
npm run test:parallel

# build
npm run build
```

Current tests cover:

- MCP smoke and structured output checks
- queue backpressure and timeout/cancel behavior
- HTTP retry and circuit-breaker recovery path
- SONA persistence and reload

CI is configured in [ci.yml](.github/workflows/ci.yml).

---

## Publishing

### 1. Local preflight

```bash
npm ci
npm test
npm run build
npm pack
```

`prepublishOnly` already enforces `npm test && npm run build`.

### 2. Manual publish

```bash
npm publish --access public --provenance
```

### 3. CI publish (recommended)

- Tag release: `vX.Y.Z`
- Push tag to GitHub
- [publish.yml](.github/workflows/publish.yml) runs test/build/publish
- Required secret: `NPM_TOKEN`

### 4. Install and run

```bash
npx -y ruvltra-mcp-server
```

or in MCP config:

```json
{
  "command": "npx",
  "args": ["-y", "ruvltra-mcp-server"]
}
```

---

## Project Structure

```
src/
  index.ts                        # エントリーポイント
  types.ts                        # 共通型定義
  core/
    mcp-server.ts                 # MCP サーバーコア
  tools/
    definitions.ts                # 13ツールの定義と outputSchema
    handlers.ts                   # ツールハンドラー実装
  workers/
    worker-pool.ts                # ワーカープール (スケーリング・キュー)
  ruvllm/
    inference-engine.ts           # 4段階フォールバック推論エンジン
    sona-engine.ts                # SONA 自己改善エンジン
  config/
    defaults.ts                   # 設定・環境変数パーサー
  utils/
    logger.ts                     # ロガー
tests/
  test-mcp.ts                     # MCP スモークテスト
  test-parallel.ts                # 並列生成テスト
  test-timeout-backpressure.ts    # タイムアウト・バックプレッシャーテスト
  test-http-resilience.ts         # HTTP リトライ・サーキットブレーカーテスト
  test-sona-persist.ts            # SONA 永続化テスト
  test-llama.ts                   # llama.cpp バックエンドテスト
  test-ruvllm.ts                  # RuvLLM バックエンドテスト
  test-ruvllm[2-5].ts             # RuvLLM 追加テストバリエーション
```
