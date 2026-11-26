/**
 * Used to show a 15-minute timer with "Items are reserved for limited time".
 * Nothing is reserved when an item is in the cart, so the timer was false and
 * has been removed. The cart page still mounts this component; it renders
 * nothing until the shop really holds stock for carts.
 */
export default function CartCountdown() {
  return null;
}
