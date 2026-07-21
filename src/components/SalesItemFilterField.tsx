import type { ChangeEvent } from "react";
import type { SalesItemFilter } from "../services/salesItemFilter";
import { formFieldClassName } from "./formStyles";

export function SalesItemFilterField(props: {
  value: SalesItemFilter;
  onChange: (filter: SalesItemFilter) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    props.onChange(event.target.value as SalesItemFilter);
  };

  return (
    <label
      className="command-field command-field--item-filter"
      htmlFor="sales-item-filter"
    >
      <span className="command-field__label">Item filter</span>
      <span className="command-field__control">
        <select
          className={formFieldClassName}
          id="sales-item-filter"
          value={props.value}
          onChange={handleChange}
        >
          <option value="all">All items</option>
          <option value="old">Old items (5d+)</option>
          <option value="without-price-check">Without price check</option>
          <option value="with-suggested-price">With suggested price</option>
        </select>
      </span>
    </label>
  );
}
