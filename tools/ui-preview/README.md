# UI preview (screenshots)

Аппыг вэб хэлбэрээр build хийж, Playwright-аар утасны хэмжээтэй (390×844) дэлгэц бүрийн зураг авна.
Supabase руу хүсэлт явахгүй — `fixtures.js` доторх жишээ өгөгдлөөр хариулна, жинхэнэ өгөгдлийн санд юу ч бичихгүй.

```bash
# 1. Хуулбар дээр (repo-гийн package.json-д вэб сан нэмэхгүйн тулд)
npm install
cd apps/mobile && npx expo install react-native-web react-dom @expo/metro-runtime

# 2. Вэб build
EXPO_PUBLIC_SUPABASE_URL=https://ttkvvclhtcngushymdkc.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=preview CI=1 \
npx expo export --platform web --output-dir /tmp/webdist

# 3. Зураг авах (бүгд, эсвэл нэрээр шүүх)
node tools/ui-preview/run.js /tmp/webdist /tmp/shots
node tools/ui-preview/run.js /tmp/webdist /tmp/shots home groups

# 4. Хажуу хажууд нь харьцуулах
python3 tools/ui-preview/sheet.py sheet.png /tmp/shots/10-home.png /tmp/shots/11-groups.png
```

Realtime (WebSocket) алдаа консолд гарах нь хэвийн — вэб урьдчилсан харагдацад чат шууд ирэхгүй.
