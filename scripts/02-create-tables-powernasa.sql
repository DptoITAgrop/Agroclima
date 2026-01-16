-- Tabla para datos climáticos de NASA POWER
CREATE TABLE IF NOT EXISTS powernasa.climate_data (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    
    -- Parámetros de temperatura
    temperature_2m DOUBLE PRECISION, -- Temperatura a 2m (°C)
    temperature_max DOUBLE PRECISION, -- Temperatura máxima (°C)
    temperature_min DOUBLE PRECISION, -- Temperatura mínima (°C)
    
    -- Radiación solar
    solar_radiation DOUBLE PRECISION, -- Radiación solar (W/m²)
    
    -- Precipitación y humedad
    precipitation DOUBLE PRECISION, -- Precipitación (mm)
    relative_humidity DOUBLE PRECISION, -- Humedad relativa (%)
    
    -- Viento
    wind_speed DOUBLE PRECISION, -- Velocidad del viento (m/s)
    wind_direction DOUBLE PRECISION, -- Dirección del viento (grados)
    
    -- Evapotranspiración
    evapotranspiration DOUBLE PRECISION, -- ET de referencia (mm/día)
    
    -- Metadatos
    data_source VARCHAR(50) DEFAULT 'NASA_POWER',
    quality_flag VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(timestamp, latitude, longitude)
);

-- Crear hypertable si TimescaleDB está disponible
SELECT create_hypertable('powernasa.climate_data', 'timestamp', 
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 month'
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_powernasa_location ON powernasa.climate_data(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_powernasa_timestamp ON powernasa.climate_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_powernasa_temp ON powernasa.climate_data(temperature_2m);

COMMENT ON TABLE powernasa.climate_data IS 'Datos climáticos históricos de NASA POWER con resolución horaria';
