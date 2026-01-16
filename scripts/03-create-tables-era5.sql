-- Tabla para datos climáticos de ERA5
CREATE TABLE IF NOT EXISTS era5.climate_data (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    
    -- Parámetros atmosféricos
    temperature_2m DOUBLE PRECISION,
    temperature_max DOUBLE PRECISION,
    temperature_min DOUBLE PRECISION,
    dew_point DOUBLE PRECISION,
    pressure DOUBLE PRECISION, -- Presión atmosférica (hPa)
    
    -- Radiación
    solar_radiation DOUBLE PRECISION,
    shortwave_radiation DOUBLE PRECISION,
    longwave_radiation DOUBLE PRECISION,
    
    -- Precipitación y humedad
    precipitation DOUBLE PRECISION,
    relative_humidity DOUBLE PRECISION,
    specific_humidity DOUBLE PRECISION,
    
    -- Viento
    wind_speed_10m DOUBLE PRECISION,
    wind_speed_100m DOUBLE PRECISION,
    wind_direction DOUBLE PRECISION,
    wind_gust DOUBLE PRECISION,
    
    -- Nubosidad
    cloud_cover DOUBLE PRECISION, -- Cobertura de nubes (%)
    
    -- Evapotranspiración
    evapotranspiration DOUBLE PRECISION,
    
    -- Metadatos
    data_source VARCHAR(50) DEFAULT 'ERA5',
    quality_flag VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(timestamp, latitude, longitude)
);

-- Crear hypertable
SELECT create_hypertable('era5.climate_data', 'timestamp',
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 month'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_era5_location ON era5.climate_data(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_era5_timestamp ON era5.climate_data(timestamp DESC);

COMMENT ON TABLE era5.climate_data IS 'Datos climáticos históricos de ERA5 con alta resolución temporal';
