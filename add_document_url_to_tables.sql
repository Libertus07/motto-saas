-- Sales ve stock_movements tablolarına belge/fiş görseli saklamak için document_url sütunu ekler.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS document_url TEXT;
