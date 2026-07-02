-- Motto SaaS İşletme Logosu İçin Storage Kurulumu

-- 1. "motto_assets" adında Public (Herkese Açık) bir depolama alanı oluştur.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('motto_assets', 'motto_assets', true);

-- 2. "motto_assets" bucket'ına yüklenen dosyalara HERKESİN okuma yetkisi (URL üzerinden görebilme)
CREATE POLICY "Public Okuma Izinleri" ON storage.objects 
FOR SELECT USING ( bucket_id = 'motto_assets' );

-- 3. Yükleme işlemini SADECE giriş yapmış (authenticated) kullanıcılar yapabilir.
CREATE POLICY "Giris Yapanlar Yukleyebilir" ON storage.objects 
FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'motto_assets' );

-- 4. Güncelleme ve silme işlemini SADECE dosyayı yükleyen kişi yapabilir.
CREATE POLICY "Sahibi Guncelleyebilir" ON storage.objects 
FOR UPDATE TO authenticated USING ( bucket_id = 'motto_assets' AND auth.uid() = owner);

CREATE POLICY "Sahibi Silebilir" ON storage.objects 
FOR DELETE TO authenticated USING ( bucket_id = 'motto_assets' AND auth.uid() = owner);
