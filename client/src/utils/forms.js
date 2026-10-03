// Moves focus to the first field that has an error, following the order the fields appear in.
export function focusFirstError(errors, fieldOrder, idFor) {
  const first = fieldOrder.find((field) => errors[field]);
  if (first) document.getElementById(idFor(first))?.focus();
}
