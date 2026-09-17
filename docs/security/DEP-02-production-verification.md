# DEP-02 production doğrulama kaydı

**Kanıt penceresi:** 2026-09-03 (UTC), ek kontrol 2026-09-06 (Europe/Istanbul)<br>
**Belgeleme:** 2026-09-06<br>
**Durum:** Kısmi production doğrulaması; kapanış kapıları açık.

Bu kayıt 3 Eylül tarihli oturumda alınan kanıtları korur. 6 Eylül kontrolleri
aşağıda ayrı belirtilmiştir; önceki testlerin tümünün yeniden çalıştırıldığı
veya sürekli sağlık garantisi verildiği anlamına gelmez.

## Dağıtım kimliği

- [PR #18](https://github.com/Libertus07/motto-saas/pull/18) merge commit'i:
  `5422eeeba92ed01449eb025203263b02e03a41c0`.
- GitHub deployment `6234586717`, ortam `Production`; status `17708323460`
  sonucu `success`, zaman `2026-09-03T00:38:23Z`.
- Vercel proje ekranı yenilendikten sonra aynı commit için `Ready` gösterdi;
  deployment kimliği `7yuMdpQxUsnupjTQxapPN61YJL86` ve ana domain
  `motto-saas.vercel.app` eşleşti.
- Dağıtım mevcut Git entegrasyonuyla merge sonrasında otomatik gerçekleşti.
  Önceki "production deployment yapılmadı" ifadesi yalnız elle deployment
  başlatılmadığı anlamında doğrudur; otomatik dağıtımın yokluğu anlamına gelmez.

## Doğrulanan davranışlar

| Kontrol                           | Sonuç ve sınırı                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public giriş                      | `/` HTTP 307 ile `/login` yönlendirdi; HTTPS/HSTS başlığı mevcut.                                                                                                                |
| Oturum                            | Kullanıcının kendi girişi ardından `/dashboard` açıldı; reload ve korumalı sayfa gezintisi çalıştı.                                                                              |
| Güvenilir yerel optimizer girdisi | `/_next/image?url=%2Ficons%2Flogo.png&w=96&q=75` HTTP 200, `image/png`, 1623 bayt.                                                                                               |
| Güvenilir uzak optimizer girdisi  | Plandaki Unsplash görseli için HTTP 200, `image/jpeg`, 1797 bayt. HTTP probları tarayıcı oturumundan bağımsızdır.                                                                |
| Service worker dosyası            | `/sw.js` HTTP 200, JavaScript, 13204 bayt. Bu sonuç kayıt/controller etkinliğini kanıtlamaz.                                                                                     |
| İşletme logosu                    | Sidebar ve ayarlar önizlemesinde 512×512 görsel yüklendi. Gözlenen `img` kaynağı doğrudan Storage; optimizer URL'si değil.                                                       |
| Mevcut yatırım belgesi            | Geçmiş yatırım fişinden modal açıldı. İlk örnekte henüz yüklenmemiş görsel, sonraki kontrolde düğmeye basmadan 1024×1536 olarak yüklendi. Kalıcı ilk-açılış hatası doğrulanmadı. |
| Dar görünümde belge               | Yüklenmiş modal daraltılınca görsel görünür kaldı; document düzeyinde yatay taşma ölçülmedi. Dar görünümde soğuk açılış ayrıca denenmelidir.                                     |

Dashboard dışında ayarlar, hammadde fiş yükleme, yatırım fiş yükleme, Z raporu,
işlem geçmişi ve yatırımlar sayfaları geniş/dar görünümde açıldı. Ölçülen geniş
CSS viewport 1600×1000, dar viewport yaklaşık 433×937 (modalda 434×938) idi.
3 Eylül oturumunda araçtan istenen 1440×900 ve 390×844 ile gerçek ölçüm
eşleşmedi; o oturumda tam 390 piksel kabul kapısı geçmedi. Bu ölçüm 6 Eylül'de
aşağıda açıklandığı şekilde düzeltildi ve gerçek 390×844 CSS görünümü
doğrulandı. Ölçülen sayfalarda document scrollWidth/clientWidth karşılaştırması
yatay taşma göstermedi; bu tek başına tüm kontrollerin görsel veya klavye
erişilebilirliğini kanıtlamaz.

## Açık kabul kapıları

1. Gerçek 390×844 ölçüm ve mevcut belgenin dar görünümde ilk açılışı 6 Eylül'de
   doğrulandı. Klavye ile sağdaki indirme düğmesine erişim geçti; modal odak
   sınırı ve fiziksel dokunma testi açık. Temiz tarayıcı önbelleğiyle soğuk
   yükleme henüz kanıtlanmadı.
2. Gözlenen `img.src` ile ağ kaydını ayır: kullanıcı kontrollü görseller için
   sıfır optimizer isteği sonucu henüz tam ağ kaydıyla kanıtlanmadı.
3. Yükleme önizlemeleri, audit görseli ve spreadsheet akışlarının production
   matrisi tamamlanmadı. Sayfanın açılması dosya seçme/parse/önizleme kanıtı
   değildir. Production test verisi oluşturmak veya finansal kayıt kaydetmek
   bu salt-okunur oturumda yapılmadı.

Tarayıcı aracının DOM değerlendirme yüzeyi `navigator`/`performance` bilgilerini
sunmadı. Bu, uygulamada PWA bulunmadığına dair kanıt değildir. Konsolda görülen
listener/message-channel hatalarının kaynağı kesinleştirilmedi; uygulama veya
eklenti kaynaklı olduğu kesin biçimde ileri sürülmez.

## Ek salt-okunur kontrol — 2026-09-06

- Mevcut Chrome profiliyle dashboard açıldı; oturum korunuyordu.
- Sayfadaki Vercel toolbar iframe'i `dpl_8r263XgqahjGfYmhNm1xXryNQLbL`
  gösterdi. Bu değer uygulama dağıtım kimliği kabul edilmemelidir. Vercel MCP
  `get_deployment(motto-saas.vercel.app)` sorgusu aynı gün production alias'ını
  `dpl_7yuMdpQxUsnupjTQxapPN61YJL86`, `READY`, `master`, kaynak commit
  `5422eeeba92ed01449eb025203263b02e03a41c0` ile eşleştirdi. Önceki dağıtım
  değişikliği şüphesi böylece giderildi; yeni deploy başlatılmadı.
- Araçta 390×844 isteği gerçekte 433×937 CSS piksel verdi. 351×760 override
  ile `innerWidth=390`, `innerHeight=844`, `clientWidth=scrollWidth=390`
  ölçüldü. Test ölçüme dayanır, yalnız istenen araç boyutuna değil.
- Bu ölçüde dashboard ve yatırım fişi geçmişi açıldı. Mevcut sentetik belge
  ilk kez bu sekmede açıldı; ek görünüm düğmesine basmadan `complete=true`,
  1024×1536 doğal boyut ve görünür görsel doğrulandı. Tarayıcı önbelleği
  temizlenmediği için bu sonuç ağ düzeyinde soğuk yükleme kanıtı değildir.
- Modal açıkken document düzeyinde yatay taşma yoktu. Alt araç çubuğu kendi
  içinde yatay kaydırılıyor; bütün düğmeler aynı anda görünmüyor. Net Oku
  düğmesi Ekrana Sığdır'a geçti. Tab ile yakınlaştırmaya ulaşıp Enter'a basınca
  yüzde 100'den 125'e geçti. Sonraki Tab adımları Sekmede Aç ve İndir'e ulaştı;
  İndir odağa geldiğinde araç çubuğu sağa kayıp düğmeyi görünür yaptı.
  İndirme/sekme açma eylemleri bu turda çalıştırılmadı.
- İndir'den sonraki Tab, modalın kapatma düğmesine dönmek yerine Vercel
  Toolbar'a geçti. Bu gözlem tüm modal erişilebilirliğinin geçtiği anlamına
  gelmez; odak sınırı, toolbar etkisi ve fiziksel dokunma ayrı incelenmelidir.
- Escape modalı kapattı; reload sonrasında korumalı geçmiş ekranı ve belge
  görüntüleme düğmesi yeniden geldi. Bu, PWA controller kanıtı değildir.
- Logo ve belge için gözlenen DOM görsel kaynakları optimizer kullanmıyordu;
  tam ağ kaydı alınmadığından sıfır optimizer isteği iddiası yapılmaz.
- Desteklenen yetenek envanterinde viewport ve pageAssets vardı; service-worker
  controller veya tam network capture yeteneği sunulmadı. Service-worker kanıtı
  aşağıdaki kullanıcı destekli DevTools görüntüsüyle tamamlandı; tam ağ kaydı
  kapısı açık tutuldu. Geçici viewport override sıfırlandı.
- `chrome://serviceworker-internals/` tanılama sayfası tarayıcı güvenlik
  politikası tarafından engellendi. Alternatif protokol veya dolaylı komutla
  kısıt aşılmadı. Bu erişim engeli uygulama hatası olarak sınıflandırılmadı.

## Kullanıcı destekli PWA kanıtı — 2026-09-06

Kullanıcının Chrome DevTools > Application > Service workers ekranından
sağladığı görüntü aşağıdaki kanıtları birlikte gösterdi:

- `https://motto-saas.vercel.app/` kapsamı altında tek görünür kayıt vardı.
- Kaynak `sw.js`; durum `#2454 activated and is running` idi.
- Clients alanında korumalı
  `/dashboard/raporlar/yatirim-gecmisi` sayfası listelendi.
- Önceki kontrollü reload sonrasında aynı korumalı sayfanın açık kalması ve bu
  ekranın onu aktif service-worker istemcisi olarak göstermesi, kayıt + aktif
  worker + kontrollü istemci kabul kapısını karşılar.
- Offline, Update on reload ve Bypass for network seçenekleri işaretli değildi;
  Stop, Update ve Unregister eylemleri çalıştırılmadı.

Bu kanıt servis çalışanının kayıtlı, etkin ve mevcut korumalı sayfayı kontrol
ettiğini doğrular. Çevrimdışı işlevlerin tamamı veya tüm tarayıcı/cihaz matrisi
için genel garanti sayılmaz.

## Yerel modal erişilebilirliği düzeltmesi — 2026-09-17

Mobilde gözlenen odak sızıntısının kaynağı, belge önizlemesinin tam ekran bir
`div` olmasıydı: Escape dinleyicisi vardı fakat odak sınırı yoktu. Ortak
`DocumentPreviewModal` tarayıcının yerleşik modal `dialog` davranışına taşındı;
başlıkla ilişkilendirildi, açılışta kapatma düğmesine odaklanıyor ve kapanışta
önceki odağı geri yüklemeyi deniyor. Görsel ve belge eylemleri korunuyor.

Yeni regresyon testi önce eski uygulamada başarısız oldu, değişiklikten sonra
geçti. `npm run check`: 436 test geçti, mevcut 3 RLS entegrasyon testi atlandı;
biçim, roadmap, lint ve tip kontrolleri geçti. Üretim derlemesi, yalnız süreç
içinde kullanılan sahte public Supabase değerleriyle 35 statik sayfa üreterek
tamamlandı. Gerçek canlı anahtar veya veri kullanılmadı.

Bu yerel kod henüz commit/push/deploy edilmedi. Bu nedenle canlı modal odak
davranışı yeniden doğrulanana kadar production kabul kapısı açık kalır.

## Veri ve teslimat sınırı

Bu kontrolde finansal kayıt, işletme logosu veya dosya eklenmedi, değiştirilmedi
ya da silinmedi; oturum kullanıcının girişine dayanır. Rapora imzalı URL,
token, kişisel bilgi veya finansal belge içeriği eklenmemiştir.

DEP-02, açık kapılar kapanana kadar **Yerelde tamam** olarak kalır. Önceki yerel
fixture matrisi production kanıtının yerine geçmez. Yeniden deploy gereksinimi
varsayılmadan önce güncel deployment kimliği kontrol edilmelidir.
