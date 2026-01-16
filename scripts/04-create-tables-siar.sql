-- Tabla para datos climáticos de SIAR
CREATE TABLE IF NOT EXISTS siar.climate_data (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    station_id VARCHAR(50), -- ID de la estación SIAR
    station_name VARCHAR(200),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation DOUBLE PRECISION, -- Altitud (m)
    
    -- Temperatura
    temperature_2m DOUBLE PRECISION,
    temperature_max DOUBLE PRECISION,
    temperature_min DOUBLE PRECISION,
    
    -- Humedad
    relative_humidity DOUBLE PRECISION,
    relative_humidity_max DOUBLE PRECISION,
    relative_humidity_min DOUBLE PRECISION,
    
    -- Radiación
    solar_radiation DOUBLE PRECISION,
    
    -- Precipitación
    precipitation DOUBLE PRECISION,
    
    -- Viento
    wind_speed DOUBLE PRECISION,
    wind_direction DOUBLE PRECISION,
    wind_speed_max DOUBLE PRECISION,
    
    -- Evapotranspiración
    eto_penman_monteith DOUBLE PRECISION, -- ETo calculado (mm/día)
    
    -- Otros parámetros agronómicos
    soil_temperature DOUBLE PRECISION, -- Temperatura del suelo (°C)
    soil_moisture DOUBLE PRECISION, -- Humedad del suelo (%)
    leaf_wetness DOUBLE PRECISION, -- Humedad foliar
    
    -- Metadatos
    data_source VARCHAR(50) DEFAULT 'SIAR',
    quality_flag VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(timestamp, station_id)
);

-- Crear hypertable
SELECT create_hypertable('siar.climate_data', 'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 month'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_siar_station ON siar.climate_data(station_id);
CREATE INDEX IF NOT EXISTS idx_siar_location ON siar.climate_data(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_siar_timestamp ON siar.climate_data(timestamp DESC);

COMMENT ON TABLE siar.climate_data IS 'Datos climáticos de estaciones SIAR en España';
