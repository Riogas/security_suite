import { useState } from "react";

export function useFormData<T>(initial: T) {
  const [data, setData] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [loading, setLoading] = useState(false);

  const setField = <K extends keyof T>(key: K, value: T[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setFieldError = <K extends keyof T>(key: K, error: string | undefined) => {
    setErrors((prev) => ({ ...prev, [key]: error }));
  };

  const reset = (newInitial?: T) => {
    setData(newInitial ?? initial);
    setErrors({});
  };

  return { data, setData, setField, errors, setErrors, setFieldError, reset, loading, setLoading };
}

export default useFormData;
