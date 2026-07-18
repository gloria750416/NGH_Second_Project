export function buildFallbackModels(preferredModel) {
  return [
    preferredModel,
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6",
  ].filter((model, index, array) => model && array.indexOf(model) === index);
}
