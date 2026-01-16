-- Vista unificada de todas las fuentes de datos
CREATE OR REPLACE VIEW public.unified_climate_data AS
SELECT 
    'NASA_POWER' as source,
    timestamp,
    latitude,
    longitude,
    temperature_2m,
    temperature_max,
    temperature_min,
    solar_radiation,
    precipitation,
    relative_humidity,
    wind_speed,
    evapotranspiration,
    created_at
FROM powernasa.climate_data
UNION ALL
SELECT 
    'ERA5' as source,
    timestamp,
    latitude,
    longitude,
    temperature_2m,
    temperature_max,
    temperature_min,
    solar_radiation,
    precipitation,
    relative_humidity,
    wind_speed_10m as wind_speed,
    evapotranspiration,
    created_at
FROM era5.climate_data
UNION ALL
SELECT 
    'SIAR' as source,
    timestamp,
    latitude,
    longitude,
    temperature_2m,
    temperature_max,
    temperature_min,
    solar_radiation,
    precipitation,
    relative_humidity,
    wind_speed,
    eto_penman_monteith as evapotranspiration,
    created_at
FROM siar.climate_data;

-- Vista de resumen diario
CREATE OR REPLACE VIEW public.daily_climate_summary AS
SELECT 
    source,
    DATE(timestamp) as date,
    latitude,
    longitude,
    AVG(temperature_2m) as avg_temperature,
    MAX(temperature_max) as max_temperature,
    MIN(temperature_min) as min_temperature,
    SUM(solar_radiation) / COUNT(*) as avg_solar_radiation,
    SUM(precipitation) as total_precipitation,
    AVG(relative_humidity) as avg_humidity,
    AVG(wind_speed) as avg_wind_speed,
    SUM(evapotranspiration) as total_evapotranspiration,
    COUNT(*) as data_points
FROM public.unified_climate_data
GROUP BY source, DATE(timestamp), latitude, longitude
ORDER BY date DESC;

COMMENT ON VIEW public.unified_climate_data IS 'Vista unificada de datos climáticos de todas las fuentes';
COMMENT ON VIEW public.daily_climate_summary IS 'Resumen diario agregado por fuente de datos';
