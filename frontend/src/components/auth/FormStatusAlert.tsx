import { CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface ValidateAlertProps {
  isSuccess: boolean;
  message: string;
}

export const ValidateAlert = (props: ValidateAlertProps) => {
  const IconComponent = props.isSuccess ? CheckCircle2Icon : AlertCircleIcon;
  return (
    <div className="flex">
      <Alert variant={props.isSuccess ? undefined : "destructive"}>
        <IconComponent />
        <AlertTitle>{props.message}</AlertTitle>
      </Alert>
    </div>
  );
};