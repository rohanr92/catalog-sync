export type Lang = 'en' | 'bn' | 'hi' | 'id' | 'es';
export const LANGS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'English' }, { key: 'bn', label: 'বাংলা' }, { key: 'hi', label: 'हिन्दी' },
  { key: 'id', label: 'Bahasa Indonesia' }, { key: 'es', label: 'Español' },
];

type Key = 'title' | 'size' | 'or' | 'shape' | 'format' | 'count' | 'swatch' | 'noSwatch' | 'editor'
  | 'kohls' | 'debenhams' | 'macys' | 'jcpenney' | 'nordstrom';

export const T: Record<Lang, Record<Key, string>> = {
  en: {
    title: 'Image requirements — {m}', size: 'Size', or: 'or', shape: 'Shape', format: 'Format',
    count: 'Images: up to {n} — slot 1 is the main image', swatch: 'Swatch: 1000 × 1000 px, one per colour', noSwatch: 'No swatch image',
    editor: 'The editor opens Image Studio at the size you pick.',
    kohls: 'JPG only. At least 1000 × 1000 px; 2500 × 2500 px preferred.',
    debenhams: 'Shortest side at least 1080 px. Shape 2:3 or 1:1.',
    macys: 'Portrait, shape 4:5.',
    jcpenney: 'Both sizes are accepted.',
    nordstrom: 'Images are uploaded to Shopify and the links are sent to Nordstrom.',
  },
  bn: {
    title: 'ছবির নিয়ম — {m}', size: 'মাপ', or: 'অথবা', shape: 'অনুপাত', format: 'ফরম্যাট',
    count: 'ছবি: সর্বোচ্চ {n}টি — ১ নম্বর স্লট মূল ছবি', swatch: 'সোয়াচ: 1000 × 1000 পিক্সেল, প্রতিটি রঙের জন্য একটি', noSwatch: 'সোয়াচ ছবি লাগে না',
    editor: 'যে মাপ বেছে নেবেন, এডিটর সেই মাপেই Image Studio খুলবে।',
    kohls: 'শুধু JPG। কমপক্ষে 1000 × 1000 পিক্সেল; 2500 × 2500 পিক্সেল হলে সবচেয়ে ভালো।',
    debenhams: 'ছোট দিকটি কমপক্ষে 1080 পিক্সেল। অনুপাত 2:3 অথবা 1:1।',
    macys: 'খাড়া (পোর্ট্রেট) ছবি, অনুপাত 4:5।',
    jcpenney: 'দুটি মাপই গ্রহণযোগ্য।',
    nordstrom: 'ছবিগুলো Shopify-তে আপলোড হয়, তারপর লিংকগুলো Nordstrom-এ পাঠানো হয়।',
  },
  hi: {
    title: 'इमेज की शर्तें — {m}', size: 'आकार', or: 'या', shape: 'अनुपात', format: 'फ़ॉर्मैट',
    count: 'इमेज: अधिकतम {n} — स्लॉट 1 मुख्य इमेज है', swatch: 'स्वॉच: 1000 × 1000 px, हर रंग के लिए एक', noSwatch: 'स्वॉच इमेज की ज़रूरत नहीं',
    editor: 'आप जो आकार चुनते हैं, एडिटर Image Studio को उसी आकार में खोलता है।',
    kohls: 'केवल JPG। कम से कम 1000 × 1000 px; 2500 × 2500 px सबसे अच्छा है।',
    debenhams: 'छोटी साइड कम से कम 1080 px। अनुपात 2:3 या 1:1।',
    macys: 'खड़ी (पोर्ट्रेट) इमेज, अनुपात 4:5।',
    jcpenney: 'दोनों आकार स्वीकार किए जाते हैं।',
    nordstrom: 'इमेज Shopify पर अपलोड होती हैं और उनके लिंक Nordstrom को भेजे जाते हैं।',
  },
  id: {
    title: 'Ketentuan gambar — {m}', size: 'Ukuran', or: 'atau', shape: 'Rasio', format: 'Format',
    count: 'Gambar: maksimal {n} — slot 1 adalah gambar utama', swatch: 'Swatch: 1000 × 1000 px, satu per warna', noSwatch: 'Tidak perlu gambar swatch',
    editor: 'Editor membuka Image Studio dengan ukuran yang Anda pilih.',
    kohls: 'Hanya JPG. Minimal 1000 × 1000 px; 2500 × 2500 px paling disarankan.',
    debenhams: 'Sisi terpendek minimal 1080 px. Rasio 2:3 atau 1:1.',
    macys: 'Potret, rasio 4:5.',
    jcpenney: 'Kedua ukuran diterima.',
    nordstrom: 'Gambar diunggah ke Shopify, lalu tautannya dikirim ke Nordstrom.',
  },
  es: {
    title: 'Requisitos de imagen — {m}', size: 'Tamaño', or: 'o', shape: 'Proporción', format: 'Formato',
    count: 'Imágenes: hasta {n} — la posición 1 es la imagen principal', swatch: 'Muestra de color: 1000 × 1000 px, una por color', noSwatch: 'Sin imagen de muestra de color',
    editor: 'El editor abre Image Studio en el tamaño que elijas.',
    kohls: 'Solo JPG. Mínimo 1000 × 1000 px; se prefiere 2500 × 2500 px.',
    debenhams: 'Lado más corto de al menos 1080 px. Proporción 2:3 o 1:1.',
    macys: 'Vertical, proporción 4:5.',
    jcpenney: 'Se aceptan ambos tamaños.',
    nordstrom: 'Las imágenes se suben a Shopify y los enlaces se envían a Nordstrom.',
  },
};
