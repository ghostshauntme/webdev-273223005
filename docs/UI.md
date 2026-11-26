# UI checklist

<!-- Exercise 4 hands this in. Tick an item only when you have checked it, and replace
     the "how I checked" line with what you actually did. An unticked box is not a
     failure: it is a gap you then write into READINESS.md. A ticked box you cannot
     demonstrate at the defence is worse than an unticked one. -->

"Modern" is not a style. It is a short list of things a user notices when they are
missing: the screen tells you what is happening, you can get through it with a keyboard,
the text is readable, and nothing jumps around while it loads.

## Layout and typography

- [x] **One spacing scale and one type scale.** Sizes come from a small set of design tokens, not from numbers typed where they were needed.
  - how I checked: проверил в `public/styles.css` переменные `--space-*` и `--type-*` у форм, карточек и заголовков карточек.
- [ ] **Responsive at 380, 768 and 1280 pixels wide.** No horizontal scrollbar, no text running under another element.
  - how I checked: студент вручную проверил адаптивность экранов входа, участника и организатора при 380, 768 и 1280 CSS px. Снимок списка при 380 CSS px показывает карточки в одной колонке. Измерения горизонтального переполнения для всех сочетаний ширины и экрана остаются открытыми. [Мобильный список](ui/mobile.png)
- [ ] **Nothing jumps while the page loads.** Images and cards reserve their space before their content arrives.
  - how I checked: сетка имеет минимальную высоту и сохраняет карточки при повторной загрузке. Запись Layout Shifts в DevTools ожидается.

## The four states, on every screen

A screen that only handles "it worked" is a screen that lies to the user on the day it matters.

- [ ] **Loading.** Something tells the user the app is working, within about 100 ms.
  - how I checked: при профиле 3G в Chrome DevTools видно «Loading events...» и ожидающие ответа запросы. В Node.js при задержанном ответе начальный текст загрузки уже был задан в HTML, а обработчики входа и записи выставляли статус до первого ожидания ответа. Также проверил статусы создания события и выхода. Время до отрисовки в браузере ещё нужно измерить. [Загрузка списка](ui/loading.png), [дополнительный кадр 3G](ui/success-3g.png)
- [x] **Empty.** The screen says what this list is for and what to do next, instead of showing nothing.
  - how I checked: в Chrome DevTools Local Overrides подставили для GET `/api/events` тело `{"events":[]}`. Карточки исчезли, появилось «There are no upcoming events. Check back later.». [Симуляция пустого списка](ui/empty.png)
- [x] **Error.** A sentence a person can read. Never a raw JSON body, never a stack trace, never just "Error".
  - how I checked: в Chrome DevTools заблокировали запрос списка. На странице появилось «Could not connect. Try again.». В Node.js подмена сетевого отказа дала то же сообщение, а повторная инициализация страницы без подмены снова загрузила карточки из SQLite. [Симуляция сетевой ошибки](ui/error.png)
- [x] **Success.** The user can see that what they did took effect, without reloading the page to find out.
  - how I checked: пользователь вручную проверил запись и отмену на Render. На снимке видны «Registration confirmed!», «You are registered» и кнопка отмены. [Подтверждение записи](ui/keyboard-focus.png)

## Keyboard and accessibility

- [x] **The main flow works with the keyboard alone.** Sign in, do the core action, sign out, without touching the mouse.
  - how I checked: студент вручную прошёл вход, запись, отмену записи и выход, используя только клавиатуру.
- [x] **The focused element is visible.** A `:focus-visible` outline that is not switched off.
  - how I checked: пользователь проверил клавиатурный фокус. На снимке виден контур кнопки «Cancel registration». Полный обход остальных экранов ещё нужен. [Фокус на кнопке](ui/keyboard-focus.png)
- [x] **Text contrast is at least 4.5:1.** Name the tool you measured with.
  - how I checked: рассчитал по формуле относительной яркости WCAG в Node.js для цветов основного текста, вторичного текста, меток, ссылок и кнопок. Минимум для проверенных пар 4,95:1.
- [ ] **Every input has a label** a screen reader reads, not just placeholder text.
  - how I checked: повторный разбор HTML через Python HTMLParser подтвердил ровно одну непустую подпись у каждого из восьми полей. На входе это Email и Password. На странице событий это Event poster, Event title, Date and time, Location, Capacity и Confirm your current password. Имена в дереве доступности и озвучивание ещё нужно проверить.
- [x] **The page has a correct `<title>` and `lang`.**
  - how I checked: в обоих HTML-файлах проверил `lang="en"` и разные названия страниц. Отдельная проверка HTTP-обработчика подтвердила title страницы входа.
- [ ] **Touch targets are at least 44 pixels.**
  - how I checked: студент измерил видимые элементы управления организатора при ширине 380 CSS px и сообщил, что все измеренные элементы были не менее 44 CSS px. Статическая проверка подтвердила объявления ширины и высоты 44 CSS px или соответствующих минимумов в CSS для полей, кнопок, ссылки Google и псевдоэлементов выбора файла и даты. Нужны измерения областей нажатия на остальных экранах и отдельная проверка нативных элементов.

## The model feature

- [x] **It shows that it is thinking.** A model call is slow and a free service may have been asleep; a frozen button is the worst possible answer.
  - how I checked: в Node.js задержал ответ на POST `/api/poster/suggest` и до его завершения проверил текст «Generating suggestions...» и отключённую кнопку.
- [x] **It shows when it failed,** and the rest of the screen still works.
  - how I checked: реальный локальный обработчик без ключа вернул отказ. Клиент показал «Automatic suggestions unavailable; enter event details manually.» и снова включил кнопку. Ввёл данные вручную, отправил форму и подтвердил появление события в списке и SQLite.
- [x] **The user can tell the model's suggestion from a fact.** It is labelled as a suggestion, not presented as data the app knows.
  - how I checked: подставил успешный ответ на запрос подсказки. Проверил заполнение названия, даты и места и текст «Review the suggestions before creating the event.». Число событий не изменилось до отдельной отправки формы. После изменения названия и заполнения вместимости проверил сохранение отредактированного события.

Автоматическая проверка модели запускала `public/app.js` в Node.js 22.23.4 с имитацией DOM и синтетическим PNG. Запросы входа, создания и чтения событий, а также отказ модели проходили через реальный HTTP-обработчик по потоку в памяти с одноразовой SQLite. Успешный ответ модели был подставлен локально. Запросов к Gemini и браузерных снимков этих сценариев не было.

Повторный локальный прогон подтвердил все три сценария модели, а также вход, запись, отмену, возврат фокуса в имитации DOM и выход. Статус выхода теперь находится перед списком событий. В ответе на запрос `/favicon.ico` без сессии проверены HTTP 200, MIME-тип и содержимое файла. Снимок waterfall отражает более раннюю версию.

## Decisions

- [x] **Dark mode, or a written decision not to have one.**
  - what I decided and why: Для Exercise 4 оставил одну светлую палитру, чтобы сократить объём проверок контраста.

## Evidence

![Подтверждение записи и видимый фокус на кнопке отмены](ui/keyboard-focus.png)

| Снимок | Что видно |
| --- | --- |
| [Мобильный список](ui/mobile.png) | Карточки в одной колонке при ручной проверке на 380 CSS px. |
| [Фокус и успех](ui/keyboard-focus.png) | Контур кнопки отмены и сообщение о подтверждении записи. |
| [Загрузка](ui/loading.png) | «Loading events...» при замедлении 3G. |
| [Дополнительный кадр 3G](ui/success-3g.png) | На снимке с этим именем видны сообщение загрузки и незавершённые запросы. |
| [Сетевая ошибка](ui/error.png) | Сообщение о сбое при блокировке запроса в DevTools. |
| [Пустой список](ui/empty.png) | Сообщение об отсутствии событий при Local Overrides. |
| [Waterfall](ui/waterfall.png) | Семь запросов, в том числе `favicon.ico` со статусом 404. |

## Оставшиеся ручные проверки

26 ноября в среде прогона не было доступного браузера или инструмента браузерной автоматизации. Пять пунктов остаются открытыми.

1. **Горизонтальное переполнение.** На экранах входа, участника и организатора при 380, 768 и 1280 CSS px сравнить `scrollWidth` и `clientWidth` документа, проверить наложения и перенос длинного названия.
2. **Смещения при загрузке.** Записать события Layout Shift и CLS на трёх экранах с отключённым кэшем и замедленной сетью.
3. **Время появления статусов.** При замедленной сети измерить появление статуса загрузки списка относительно первого кадра, а для действий — от активации до первого кадра со статусом. Ориентир — около 100 мс.
4. **Доступные имена.** Проверить вычисленные имена всех восьми полей в дереве доступности браузера и их объявление экранным диктором.
5. **Области нажатия.** При 380 CSS px измерить обе стороны областей нажатия на входе и у участника, включая ссылку Google и кнопки карточек. Отдельно проверить нативные элементы выбора файла и даты у организатора. Минимум — 44 × 44 CSS px.
