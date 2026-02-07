# Test BullMQ Queue Infrastructure

**Purpose**: Verify BullMQ queue infrastructure is working correctly - queues registered, workers processing jobs

**When to Use**:
- After BullMQ configuration changes
- When debugging queue processing issues
- To verify workers are connecting to correct Redis
- After Docker container restart

## Command Behavior

This command will:
1. Run the test script in Docker container
2. Add a test job to CACHE_INVALIDATION queue
3. Wait 5 seconds for worker to process
4. Report job status (waiting/active/completed/failed)
5. Show queue statistics
6. Display recent failed jobs with error messages

## Usage

```bash
/test-bullmq
```

Or specify custom Docker instance:

```bash
/test-bullmq instance=2
```

## Success Criteria

✅ **Working Infrastructure**:
```
✅ Connected to queue: cache-invalidation
✅ Test job added with ID: X
📋 Job state: completed
✅ SUCCESS! Job was processed by BullMQ worker
📊 Queue Stats:
  - Completed: 1+ jobs
```

❌ **Broken Infrastructure**:
```
📋 Job state: waiting
⚠️ WARNING! Job is still waiting - worker may not be running
📊 Queue Stats:
  - Waiting: 1+ jobs
  - Completed: 0 jobs
```

## Common Issues

### Jobs Stuck in "waiting"
**Symptom**: Jobs added but never processed
**Causes**:
- Worker not running (@Processor class missing)
- Local queue registration with wrong Redis config
- Worker connecting to different Redis than where jobs queued

**Fix**: Check AuthorizationModule doesn't have local BullModule.registerQueue()

### Redis Connection Errors
**Symptom**: ECONNREFUSED errors
**Causes**:
- Wrong host (localhost vs Docker service name)
- Wrong port (host-mapped vs container port)
- Redis container not running

**Fix**: Use Docker service names and container internal ports

### Worker Not Starting
**Symptom**: Application starts but no worker logs
**Causes**:
- BaseQueueProcessor not extending WorkerHost
- Missing @Processor decorator
- Processor not in module providers

**Fix**: Ensure processor extends WorkerHost with super() call

## References

- Test Script: `test-bullmq.js`
- Pattern Documentation: `.claude/memory/agent-knowledge/infrastructure-api-patterns.md`
- Standards: `.claude/standards/global/conventions.md` (BullMQ section)
- Global Registration: `src/shared/infrastructure/queues/bull.module.ts`
- Base Processor: `src/shared/infrastructure/queues/base-queue-processor.ts`

## Example Output

```
🔍 Testing BullMQ Queue Infrastructure
📡 Redis connection: { host: 'local-hero-redis-2', port: 6379, db: 2 }

✅ Connected to queue: cache-invalidation

📊 Current Queue Stats:
  - Waiting: 0
  - Active: 0
  - Completed: 3
  - Failed: 0

🚀 Adding test job to queue...
✅ Test job added with ID: 12

⏳ Waiting 5 seconds for job processing...
📋 Job state: completed
✅ SUCCESS! Job was processed by BullMQ worker

📊 Updated Queue Stats:
  - Waiting: 0
  - Active: 0
  - Completed: 4
  - Failed: 0

📜 Recent jobs:
  - Completed: 4 jobs
    • Job 12: test-cache-invalidation (finished)
    • Job 11: test-cache-invalidation (finished)
  - Failed: 0 jobs

✅ Test complete!
```
