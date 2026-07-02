-- investment_transactions tablosuna transaction_date (İşlem/Fiş Tarihi) sütununu ekler
ALTER TABLE investment_transactions 
ADD COLUMN IF NOT EXISTS transaction_date DATE;
