"use client";

import { forwardRef } from "react";
import { inputStyle } from "./FormField";

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ error, options, placeholder, ...props }, ref) => (
    <select
      ref={ref}
      {...props}
      style={{
        ...inputStyle(error),
        cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235C6880' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: "2rem",
        ...props.style,
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
);
SelectField.displayName = "SelectField";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      style={{ ...inputStyle(error), ...props.style }}
    />
  )
);
TextInput.displayName = "TextInput";

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ error, ...props }, ref) => (
    <input
      ref={ref}
      type="date"
      {...props}
      style={{
        ...inputStyle(error),
        colorScheme: "dark",
        ...props.style,
      }}
    />
  )
);
DateInput.displayName = "DateInput";

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  ({ error, ...props }, ref) => (
    <textarea
      ref={ref}
      {...props}
      style={{
        ...inputStyle(error),
        resize: "vertical",
        minHeight: 80,
        ...props.style,
      }}
    />
  )
);
TextArea.displayName = "TextArea";
