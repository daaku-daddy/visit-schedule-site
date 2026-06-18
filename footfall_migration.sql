-- Footfall data migration: weekday + weekend median visitors per hour
-- Source: Hourly_Footfall_Corrected_Analysis.xlsx (Median column, hours 9–19)
-- Run in Supabase SQL editor. Store name match is case-insensitive LIKE.

UPDATE stores
SET footfall_data = '{
  "weekday": {"9":0,"10":1,"11":4,"12":5,"13":5,"14":5,"15":5,"16":5,"17":4,"18":4,"19":4},
  "weekend": {"9":0,"10":1,"11":6,"12":11,"13":10,"14":9,"15":9,"16":9,"17":10,"18":10,"19":7}
}'::jsonb
WHERE lower(name) LIKE '%jp nagar%';

UPDATE stores
SET footfall_data = '{
  "weekday": {"9":0,"10":1,"11":2,"12":3,"13":3,"14":2,"15":3,"16":3,"17":3,"18":3,"19":3},
  "weekend": {"9":0,"10":1,"11":5,"12":6,"13":7,"14":7,"15":9,"16":8,"17":7,"18":8,"19":6}
}'::jsonb
WHERE lower(name) LIKE '%whitefield%';

UPDATE stores
SET footfall_data = '{
  "weekday": {"9":0,"10":0,"11":2,"12":2,"13":2,"14":2,"15":2,"16":2,"17":2,"18":2,"19":2},
  "weekend": {"9":0,"10":1,"11":3,"12":4,"13":4,"14":4,"15":5,"16":4,"17":5,"18":4,"19":3}
}'::jsonb
WHERE lower(name) LIKE '%yelahanka%';

-- Verify
SELECT name, footfall_data FROM stores ORDER BY name;
