-- Script para crear las bases de datos y esquemas necesarios
-- Este script debe ejecutarse primero

-- Crear la base de datos principal si no existe
-- CREATE DATABASE agroclima;

-- Conectar a la base de datos agroclima
-- \c agroclima;

-- Crear los esquemas para cada fuente de datos
CREATE SCHEMA IF NOT EXISTS powernasa;
CREATE SCHEMA IF NOT EXISTS era5;
CREATE SCHEMA IF NOT EXISTS siar;
CREATE SCHEMA IF NOT EXISTS public;

-- Habilitar la extensión TimescaleDB si está disponible
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS postgis;

COMMENT ON SCHEMA powernasa IS 'Datos meteorológicos de NASA POWER API';
COMMENT ON SCHEMA era5 IS 'Datos meteorológicos de ERA5 Climate Data Store';
COMMENT ON SCHEMA siar IS 'Datos meteorológicos de SIAR (Sistema de Información Agroclimática para el Regadío)';
