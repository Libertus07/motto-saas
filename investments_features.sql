-- Yatırımlar tablosuna ek özellikleri barındıran sütunların eklenmesi
ALTER TABLE investments
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS document_url TEXT; -- Dosya yüklemeleri (Base64 URL) için TEXT kullanıyoruz
