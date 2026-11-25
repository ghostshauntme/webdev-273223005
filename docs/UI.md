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
  - how I checked: проверил стили переноса заголовка и ограничения сетки по ширине. Замеры в браузере на 380, 768 и 1280 px ожидаются.
- [ ] **Nothing jumps while the page loads.** Images and cards reserve their space before their content arrives.
  - how I checked: сетка имеет минимальную высоту и сохраняет карточки при повторной загрузке. Запись Layout Shifts в DevTools ожидается.

## The four states, on every screen

A screen that only handles "it worked" is a screen that lies to the user on the day it matters.

- [ ] **Loading.** Something tells the user the app is working, within about 100 ms.
  - how I checked: исходный HTML содержит «Loading events…», при отправке форм JS обновляет область статуса до запроса. Время появления в браузере ожидается.
- [ ] **Empty.** The screen says what this list is for and what to do next, instead of showing nothing.
  - how I checked: в Node VM с тестовыми DOM и fetch подтвердил текст «There are no upcoming events. Check back later.». Снимок ожидается.
- [ ] **Error.** A sentence a person can read. Never a raw JSON body, never a stack trace, never just "Error".
  - how I checked: в Node VM подтвердил человекочитаемое сообщение при сетевой ошибке, по коду проверил обработку пустого или не-JSON ответа. Снимок и браузерная проверка ожидаются.
- [ ] **Success.** The user can see that what they did took effect, without reloading the page to find out.
  - how I checked: в Node VM подтвердил вывод числа событий, подтверждений записи и отмены и смену кнопки. Браузерная проверка ожидается.

## Keyboard and accessibility

- [ ] **The main flow works with the keyboard alone.** Sign in, do the core action, sign out, without touching the mouse.
  - how I checked: проверка Tab, Shift+Tab, Enter и Space на входе, записи, отмене и выходе ожидается.
- [ ] **The focused element is visible.** A `:focus-visible` outline that is not switched off.
  - how I checked: в CSS есть общий контрастный `:focus-visible`. Визуальная проверка ожидается.
- [x] **Text contrast is at least 4.5:1.** Name the tool you measured with.
  - how I checked: рассчитал по формуле относительной яркости WCAG в Node.js для цветов основного текста, вторичного текста, меток, ссылок и кнопок. Минимум для проверенных пар 4,95:1.
- [ ] **Every input has a label** a screen reader reads, not just placeholder text.
  - how I checked: в исходном HTML проверил связи `for` и вложенные поля. Имена в дереве доступности браузера ожидаются.
- [x] **The page has a correct `<title>` and `lang`.**
  - how I checked: в обоих HTML-файлах проверил `lang="en"` и разные названия страниц. Отдельная проверка HTTP-обработчика подтвердила title страницы входа.
- [ ] **Touch targets are at least 44 pixels.**
  - how I checked: в CSS проверил `min-height: 44px` у полей, кнопок и ссылки Google. Реальные размеры ожидают проверки в DevTools.

## The model feature

- [ ] **It shows that it is thinking.** A model call is slow and a free service may have been asleep; a frozen button is the worst possible answer.
  - how I checked: JS задаёт «Generating suggestions…» до запроса и блокирует кнопку. Снимок ожидается.
- [ ] **It shows when it failed,** and the rest of the screen still works.
  - how I checked: проверил ветку восстановления формы по исходнику. Снимок браузера без ключа ожидается.
- [ ] **The user can tell the model's suggestion from a fact.** It is labelled as a suggestion, not presented as data the app knows.
  - how I checked: JS выводит «Review the suggestions before creating the event.» и требует отдельной отправки формы. Проверка с тестовым ответом в браузере ожидается.

## Decisions

- [x] **Dark mode, or a written decision not to have one.**
  - what I decided and why: Для Exercise 4 оставил одну светлую палитру, чтобы сократить объём проверок контраста.

## Evidence

<!-- Screenshots of at least the four states of one screen, and of the model feature
     thinking and failing. A link to them is enough; they do not have to be in the repo. -->

Снимки ожидаются. Сценарии и ожидаемые результаты описаны в [READINESS.md](../READINESS.md#states--четыре-состояния-экрана).
