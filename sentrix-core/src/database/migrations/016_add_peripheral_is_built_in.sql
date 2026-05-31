-- Migration 016: Add is_built_in column to peripheral tracking and USB devices
-- This allows distinguishing between internal components and external peripherals.

ALTER TABLE client_peripheral_inventory
  ADD COLUMN is_built_in TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE client_usb_devices
  ADD COLUMN is_built_in TINYINT(1) NOT NULL DEFAULT 0;
