# ZKCELL — POS & PPOB Counter Management System

A real-time Point of Sale (POS) and PPOB (Payment Point Online Bank) operational web application built for cellular retail counters. The system manages cashier shifts, physical product sales, digital top-ups, and owner financial reporting.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, Socket.io Client
- **Backend:** Node.js, Express.js, Socket.io
- **Database:** MySQL

## Core Features

- **Cashier Shift & Cash Reconciliation:** Opening and closing cashier shifts with automated expected vs. actual cash calculation and discrepancy tracking.
- **POS & PPOB Transactions:** Unified checkout workflow supporting physical accessories/starter packs and digital products (mobile credit, data packages, e-wallets, electricity tokens).
- **Transaction History & Filtering:** Period-based transaction logs, product category filters (including dedicated electricity token filters), and receipt tracking.
- **Owner Dashboard & Reporting:** Real-time revenue monitoring, shift summaries, and sales analytics.
- **Real-Time Updates:** Live state synchronization across cashier and owner views via WebSockets (`Socket.io`).

## Integration Status (Development / Sandbox Mode)

- **Digiflazz PPOB API & QRIS Payment Gateway:** Currently implemented using a **webhook simulation & sandbox workflow** (approximately 90% complete). Live production credentials are pending merchant account verification from the third-party providers.

## Project Structure

```text
zkcell-pos-ppob/
├── frontend/          # React + Vite client application
├── backend/           # Node.js + Express REST API & Socket.io server
└── README.md