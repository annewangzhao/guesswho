// Minimal screen manager: shows one <section class="screen"> at a time.
// Screens are identified by the suffix of their id, e.g. id="screen-landing" -> "landing".

export function showScreen(name) {
  const screens = document.querySelectorAll(".screen");
  let matched = false;

  screens.forEach((el) => {
    const isTarget = el.id === `screen-${name}`;
    el.dataset.active = isTarget ? "true" : "false";
    if (isTarget) matched = true;
  });

  if (!matched) {
    console.warn(`showScreen: no screen found for "${name}"`);
  }
}
