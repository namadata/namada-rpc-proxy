# Namada RPC Proxy - Project Scope and Instructions

## Project Overview

Build a performant, publicly accessible CometBFT RPC proxy and load balancer for Namada mainnet and testnets. The system will automatically monitor RPC endpoint health and intelligently route requests to the most responsive and synchronized nodes.

## System Architecture

### Multi-Chain Concurrent Design
The system runs multiple network instances concurrently from a single deployment, with each chain maintaining its own isolated health monitoring, load balancing, and RPC pools.

### Base URL Structure
- **Service Domain**: `namacall.namadata.xyz`
- **Mainnet Endpoint**: `/namada/{rpc_query}`
- **Testnet Endpoint**: `/housefiretestnet/{rpc_query}`
- **Archive Node Option**: `/namada/archive/{rpc_query}` or `/housefiretestnet/archive/{rpc_query}`

### Chain Instance Separation
Each supported chain operates as an independent instance with:
- **Isolated RPC Pool**: Separate healthy/unhealthy RPC tracking
- **Independent Health Monitoring**: Chain-specific sync status and block height tracking
- **Dedicated Load Balancing**: Per-chain request distribution
- **Separate Archive Classification**: Chain-specific archive node pools

### RPC Registry Sources
Monitor RPC endpoints from the Luminara registry:

**Mainnet Registry**:
```
https://github.com/Luminara-Hub/namada-ecosystem/blob/main/user-and-dev-tools/mainnet/rpc.json
```

**Testnet Registry**:
```
https://github.com/Luminara-Hub/namada-ecosystem/blob/main/user-and-dev-tools/testnet/housefire/rpc.json
```

### Registry Schema
Each RPC entry follows this structure:
```json
[
  {
    "RPC Address": "https://namada-housefire-rpc.emberstake.xyz",
    "Team or Contributor Name": "EmberStake",
    "Discord UserName": "4rash",
    "GitHub Account": "EmberStake"
  }
]
```

## Core Requirements

### 1. Multi-Chain Health Monitoring System

#### Per-Chain RPC Health Checks
- **Frequency**: Every 30 seconds per chain instance
- **Endpoint**: Query `/status` endpoint on each RPC for each chain
- **Registry Updates**: Fetch new RPC list from GitHub every 10 minutes per chain
- **Concurrent Execution**: All chain health checks run simultaneously without blocking

#### Chain-Specific Health Criteria
Each chain instance maintains its own health assessment:
1. **Connectivity**: Successfully responds to `/status` queries
2. **Chain-Specific Synchronization**: Within 50 blocks of the median height for that specific chain
3. **Sync Status**: `catching_up` field is `false` for the respective chain
4. **Archive Classification**: If `earliest_block_height` equals 1, classify as archive node for that chain

#### Cross-Chain Isolation
- **Independent Median Calculations**: Each chain calculates its own median block height
- **Separate Health States**: RPC health status tracked independently per chain
- **Isolated Failure Handling**: Chain-specific circuit breakers and recovery logic

### 2. Multi-Chain Load Balancing Logic

#### Chain-Aware Request Routing
- **Route Identification**: Parse URL prefix to determine target chain (`/namada/` vs `/housefiretestnet/`)
- **Chain-Specific Pools**: Route requests only to healthy RPCs for the target chain
- **Independent Load Distribution**: Each chain maintains its own load balancing algorithm
- **Cross-Chain Isolation**: No mixing of RPC pools between different chains

#### Per-Chain Archive Node Handling
- **Chain-Specific Archive Pools**: Maintain separate archive node pools for each chain
- **Independent Archive Routing**: `/namada/archive/` routes only to mainnet archive nodes
- **Chain-Isolated Fallback**: Fallback logic operates within chain boundaries only

#### Concurrent Chain Operations
- **Parallel Processing**: Handle requests for different chains simultaneously
- **Resource Isolation**: Prevent one chain's issues from affecting others
- **Independent Scaling**: Each chain can scale its RPC pool independently

### 3. Proxy Functionality

#### CORS Configuration
- Enable CORS headers for public accessibility
- Support cross-origin requests from web applications

#### Request Forwarding
- Act as transparent proxy for CometBFT RPC calls
- Preserve original request parameters and headers
- Return responses in original format

## Technical Specifications

### Performance Requirements
- Low latency request routing
- High availability (99.9% uptime target)
- Efficient connection pooling and reuse
- Graceful handling of RPC failures

### Monitoring and Logging
- Track RPC response times and availability
- Log health check results and routing decisions
- Implement metrics for load balancing effectiveness
- Error tracking and alerting capabilities

### Deployment Configuration
- **Web Server**: Nginx as reverse proxy and static file server
- **Backend**: Application server handling health checks and load balancing
- **Configuration**: Environment-based settings for different networks

## Implementation Guidelines

### Health Check Implementation
1. **Concurrent Chain Monitoring**: Implement separate goroutines/threads for each chain's health checks
2. **Chain-Specific Median Calculation**: Calculate median block height independently for each chain
3. **Isolated State Management**: Maintain separate in-memory or database state for each chain
4. **Cross-Chain Resource Sharing**: Share connection pools and HTTP clients while maintaining logical separation

### Multi-Chain Load Balancer Algorithm
1. **Chain Identification Middleware**: Route detection based on URL prefix
2. **Per-Chain Weighted Routing**: Independent weighted round-robin for each chain based on chain-specific response times
3. **Chain-Isolated Circuit Breakers**: Independent failure detection and recovery per chain
4. **Parallel Chain Processing**: Handle multiple chain requests simultaneously without blocking

### Chain-Specific Error Handling
1. **Independent Degradation**: Chain-specific graceful degradation when RPCs are unavailable
2. **Per-Chain Retry Logic**: Chain-isolated retry with exponential backoff
3. **Cross-Chain Status Reporting**: Aggregate status across chains for monitoring
4. **Chain-Specific Error Messages**: Network-aware error responses

### Security Considerations
1. Rate limiting to prevent abuse
2. Input validation for RPC queries
3. Secure handling of upstream RPC connections
4. Protection against common web vulnerabilities

## Deployment Architecture

### Nginx Configuration
- Reverse proxy setup for backend application
- Static asset serving
- SSL/TLS termination
- Compression and caching headers

### Application Structure
- **Multi-Chain Manager**: Central coordinator for managing multiple chain instances
- **Chain Instance Module**: Separate instance class/struct for each supported chain
- **Shared Resource Pool**: Common HTTP client pool and connection management
- **Chain-Specific Configuration**: Network-specific settings and RPC registry URLs
- **Unified API Layer**: Single API that routes to appropriate chain instances
- **Cross-Chain Monitoring**: Aggregate health monitoring and statistics across all chains

### Chain Instance Architecture
Each chain instance contains:
- **RPC Pool Manager**: Health tracking and load balancing for chain-specific RPCs
- **Health Check Scheduler**: Independent 30-second health monitoring loop
- **Registry Updater**: 10-minute GitHub registry polling for new RPCs
- **Request Router**: Chain-specific request forwarding and response handling
- **Archive Node Manager**: Separate tracking and routing for archive nodes

## Success Criteria

1. **Multi-Chain Reliability**: Successfully route 99%+ of valid requests to healthy RPCs for each supported chain independently
2. **Cross-Chain Performance**: Sub-100ms average response time for health checks across all chains
3. **Chain-Specific Accuracy**: Maintain accurate sync status for all monitored RPCs per chain
4. **Concurrent Scalability**: Support addition of new networks without affecting existing chains
5. **Isolated Maintainability**: Clear per-chain monitoring dashboards and logging systems
6. **Resource Efficiency**: Concurrent chain operations without resource contention or blocking

## Optional Enhancements

- **Multi-Chain Dashboard**: Web interface showing status across all supported chains
- **Cross-Chain Analytics**: Comparative performance metrics between chains
- **Chain-Specific APIs**: Per-chain endpoints for retrieving health statistics
- **Unified Webhook System**: Notifications for RPC status changes across all chains
- **Historical Chain Comparison**: Performance tracking and analytics across multiple networks
- **Dynamic Chain Addition**: Runtime addition of new Namada networks without deployment