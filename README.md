---
title: Inception Flap Scanner
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Inception Flap Scanner

A real-time on-chain contract auditor, token scanner, and launch monitor on BNB Smart Chain (BSC). Containerized with Docker and deployed on Hugging Face Spaces.

**Live Application:** [https://lucace-inception-flap-scanner.hf.space](https://lucace-inception-flap-scanner.hf.space)  
**Hugging Face Space:** [https://huggingface.co/spaces/Lucace/inception-flap-scanner](https://huggingface.co/spaces/Lucace/inception-flap-scanner)  
**License:** MIT

---

## Overview

Inception Flap Scanner provides real-time automated monitoring and security analysis for new token deployments and liquidity pool creations on BNB Smart Chain. 

The application listens directly to on-chain transactions and RPC nodes, extracting contract bytecodes, verifying contract ownership status, and assessing security parameters (honeypot detection, transfer restrictions, liquidity depth). Data is served through an institutional-grade dark terminal interface with live streaming updates.

---

## Key Features

- **Real-Time On-Chain Scanner:** Listens for newly created contracts and liquidity pairs on BNB Smart Chain via WebSocket and RPC connections.
- **Automated Security Auditor:** Evaluates token safety metrics, including contract verification status, ownership renouncement, tax rates, and liquidity lock verifications.
- **Real-Time Streaming UI:** High-contrast terminal dashboard presenting real-time blocks, token details, liquidity ratios, and direct explorer links.
- **Production Docker Architecture:** Containerized using a multi-stage Node.js 22 environment configured for container orchestration and automated cloud deployments on port 7860.

---

## Tech Stack

- **Runtime:** Node.js 22 LTS (Alpine Linux)
- **Containerization:** Docker (`Dockerfile`, EXPOSE 7860)
- **Web3 & Scraping:** Ethers.js, Web3 RPCs, cloudscraper, gmgn-cli
- **Hosting:** Hugging Face Spaces (Docker SDK) & Vercel

---

## Local Development (Docker)

### Run with Docker:
```bash
# Build the Docker image
docker build -t inception-flap-scanner .

# Run container on port 7860
docker run -p 7860:7860 inception-flap-scanner
```

Visit [http://localhost:7860](http://localhost:7860) to view the scanner dashboard.

---

## License

Released under the MIT License.
