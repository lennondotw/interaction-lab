export const removeExtraSpace = (filterString: string) => {
  return filterString.replaceAll(/\s+/g, ' ').replaceAll(/^\s+|\s+$/g, '');
};
