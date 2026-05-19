import { Input } from "@windmill/react-ui";

const InputAreaTwo = ({
  register,
  defaultValue,
  required,
  name,
  label,
  type,
  placeholder,
  min,
  step,
}) => {
  return (
    <>
      <Input
        {...register(`${name}`, {
          required: required ? `${label} is required!` : false,
        })}
        defaultValue={defaultValue}
        type={type}
        placeholder={placeholder}
        min={min}
        step={step}
        name={name}
        autoComplete="new-password"
        className="mr-2 p-2"
      />
    </>
  );
};

export default InputAreaTwo;
