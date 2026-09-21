import { findProduct, resolveCity } from '../../../server/catalog';
import { HttpError, json, route } from '../../../server/http';

export const GET = route((request, { id }) => {
  const product = findProduct(resolveCity(request), id);
  if (!product) throw new HttpError(404, 'Product not found');
  return json(product);
});
