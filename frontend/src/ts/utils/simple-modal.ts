import AnimatedModal, { HideOptions, ShowOptions } from "./animated-modal";
import { Attributes, buildTag } from "./tag-builder";
import { format as dateFormat } from "date-fns/format";
import * as Loader from "../elements/loader";
import * as Notifications from "../elements/notifications";
import * as ConnectionState from "../states/connection";
import {
  Validation,
  ValidationOptions,
  ValidationResult,
  validateWithIndicator as withValidation,
} from "../elements/input-validation";

type CommonInput<TType, TValue> = {
  type: TType;
  initVal?: TValue;
  placeholder?: string;
  hidden?: boolean;
  disabled?: boolean;
  optional?: boolean;
  label?: string;
  oninput?: (event: Event) => void;
  /**
   * Validate the input value and indicate the validation result next to the input.
   * If the schema is defined it is always checked first.
   * Only if the schema validaton is passed or missing the `isValid` method is called.
   */
  validation?: Omit<Validation<string>, "isValid"> & {
    /**
     * Custom async validation method.
     * This is intended to be used for validations that cannot be handled with a Zod schema like server-side validations.
     * @param value current input value
     * @param thisPopup the current modal
     * @returns true if the `value` is valid, an errorMessage as string if it is invalid.
     */
    isValid?: (value: string, thisPopup: SimpleModal) => Promise<true | string>;
  };
};

export type TextInput = CommonInput<"text", string>;
export type TextArea = CommonInput<"textarea", string>;
export type PasswordInput = CommonInput<"password", string>;
type EmailInput = CommonInput<"email", string>;

type RangeInput = {
  min: number;
  max: number;
  step?: number;
} & CommonInput<"range", number>;

type DateTimeInput = {
  min?: Date;
  max?: Date;
} & CommonInput<"datetime-local", Date>;
type DateInput = {
  min?: Date;
  max?: Date;
} & CommonInput<"date", Date>;

type CheckboxInput = {
  label: string;
  placeholder?: never;
  description?: string;
} & CommonInput<"checkbox", boolean>;

type NumberInput = {
  min?: number;
  max?: number;
} & CommonInput<"number", number>;

type CommonInputType =
  | TextInput
  | TextArea
  | PasswordInput
  | EmailInput
  | RangeInput
  | DateTimeInput
  | DateInput
  | CheckboxInput
  | NumberInput;

export type ExecReturn = {
  status: 1 | 0 | -1;
  message: string;
  showNotification?: false;
  notificationOptions?: Notifications.AddNotificationOptions;
  hideOptions?: HideOptions;
  afterHide?: () => void;
};

type FormInput = CommonInputType & {
  hasError?: boolean;
  currentValue: () => string;
};
type SimpleModalOptions = {
  id: string;
  title: string;
  inputs?: CommonInputType[];
  text?: string;
  textAllowHtml?: boolean;
  buttonText: string;
  execFn: (thisPopup: SimpleModal, ...params: string[]) => Promise<ExecReturn>;
  beforeInitFn?: (thisPopup: SimpleModal) => void;
  beforeShowFn?: (thisPopup: SimpleModal) => void;
  canClose?: boolean;
  onlineOnly?: boolean;
  hideCallsExec?: boolean;
  showLabels?: boolean;
};

export class SimpleModal {
  parameters: string[];
  wrapper: HTMLElement;
  element: HTMLElement;
  modal: AnimatedModal;
  id: string;
  title: string;
  inputs: FormInput[];
  text?: string;
  textAllowHtml: boolean;
  buttonText: string;
  execFn: (thisPopup: SimpleModal, ...params: string[]) => Promise<ExecReturn>;
  beforeInitFn: ((thisPopup: SimpleModal) => void) | undefined;
  beforeShowFn: ((thisPopup: SimpleModal) => void) | undefined;
  canClose: boolean;
  onlineOnly: boolean;
  hideCallsExec: boolean;
  showLabels: boolean;
  constructor(options: SimpleModalOptions) {
    this.parameters = [];
    this.id = options.id;
    this.execFn = options.execFn;
    this.title = options.title;
    this.inputs = (options.inputs as FormInput[]) ?? [];
    this.text = options.text;
    this.textAllowHtml = options.textAllowHtml ?? false;
    this.wrapper = modal.getWrapper();
    this.element = modal.getModal();
    this.modal = modal;
    this.buttonText = options.buttonText;
    this.beforeInitFn = options.beforeInitFn;
    this.beforeShowFn = options.beforeShowFn;
    this.canClose = options.canClose ?? true;
    this.onlineOnly = options.onlineOnly ?? false;
    this.hideCallsExec = options.hideCallsExec ?? false;
    this.showLabels = options.showLabels ?? false;
  }
  reset(): void {
    this.element.innerHTML = `
    <div class="title"></div>
    <div class="inputs"></div>
    <div class="text"></div>
    <button type="submit" class="submitButton"></button>`;
  }

  init(): void {
    const el = $(this.element);
    el.find("input").val("");
    this.reset();
    el.attr("data-popup-id", this.id);
    el.find(".title").text(this.title);
    if (this.textAllowHtml) {
      el.find(".text").html(this.text ?? "");
    } else {
      el.find(".text").text(this.text ?? "");
    }

    this.initInputs();

    if (this.buttonText === "") {
      el.find(".submitButton").remove();
    } else {
      el.find(".submitButton").text(this.buttonText);
    }

    if ((this.text ?? "") === "") {
      el.find(".text").addClass("hidden");
    } else {
      el.find(".text").removeClass("hidden");
    }

    // }
  }

  initInputs(): void {
    const el = $(this.element);

    const allInputsHidden = this.inputs.every((i) => i.hidden);
    if (allInputsHidden || this.inputs.length === 0) {
      el.find(".inputs").addClass("hidden");
      return;
    }

    const inputs = el.find(".inputs");
    if (this.showLabels) inputs.addClass("withLabel");

    this.inputs.forEach((input, index) => {
      const id = `${this.id}_${index}`;

      if (this.showLabels && !input.hidden) {
        inputs.append(`<label for="${id}">${input.label ?? ""}</label>`);
      }

      const tagname = input.type === "textarea" ? "textarea" : "input";
      const classes = input.hidden ? ["hidden"] : undefined;
      const attributes: Attributes = {
        id: id,
        placeholder: input.placeholder ?? "",
        autocomplete: "off",
      };

      if (input.type !== "textarea") {
        attributes["value"] = input.initVal?.toString() ?? "";
        attributes["type"] = input.type;
      }
      if (!input.hidden && !input.optional) {
        attributes["required"] = true;
      }
      if (input.disabled) {
        attributes["disabled"] = true;
      }

      if (input.type === "textarea") {
        inputs.append(
          buildTag({
            tagname,
            classes,
            attributes,
            innerHTML: input.initVal,
          })
        );
      } else if (input.type === "checkbox") {
        let html = buildTag({ tagname, classes, attributes });

        if (input.description !== undefined) {
          html += `<span>${input.description}</span>`;
        }
        if (!this.showLabels) {
          html = `
          <label class="checkbox">
            ${html}
            <div>${input.label}</div>
          </label>
        `;
        } else {
          html = `<div>${html}</div>`;
        }
        inputs.append(html);
      } else if (input.type === "range") {
        inputs.append(`
          <div>
            ${buildTag({
              tagname,
              classes,
              attributes: {
                ...attributes,
                min: input.min.toString(),
                max: input.max.toString(),
                step: input.step?.toString(),
                oninput: "this.nextElementSibling.innerHTML = this.value",
              },
            })}
            <span>${input.initVal ?? ""}</span>
          </div>
          `);
      } else {
        switch (input.type) {
          case "text":
          case "password":
          case "email":
            break;

          case "datetime-local": {
            if (input.min !== undefined) {
              attributes["min"] = dateFormat(
                input.min,
                "yyyy-MM-dd'T'HH:mm:ss"
              );
            }
            if (input.max !== undefined) {
              attributes["max"] = dateFormat(
                input.max,
                "yyyy-MM-dd'T'HH:mm:ss"
              );
            }
            if (input.initVal !== undefined) {
              attributes["value"] = dateFormat(
                input.initVal,
                "yyyy-MM-dd'T'HH:mm:ss"
              );
            }
            break;
          }
          case "date": {
            if (input.min !== undefined) {
              attributes["min"] = dateFormat(input.min, "yyyy-MM-dd");
            }
            if (input.max !== undefined) {
              attributes["max"] = dateFormat(input.max, "yyyy-MM-dd");
            }
            if (input.initVal !== undefined) {
              attributes["value"] = dateFormat(input.initVal, "yyyy-MM-dd");
            }
            break;
          }
          case "number": {
            attributes["min"] = input.min?.toString();
            attributes["max"] = input.max?.toString();
            break;
          }
        }
        inputs.append(buildTag({ tagname, classes, attributes }));
      }
      const element = document.querySelector(
        "#" + attributes["id"]
      ) as HTMLInputElement;

      if (input.oninput !== undefined) {
        element.oninput = input.oninput;
      }

      input.currentValue = () => {
        if (element.type === "checkbox")
          return element.checked ? "true" : "false";
        return element.value;
      };

      if (input.validation !== undefined) {
        const options: ValidationOptions<string> = {
          schema: input.validation.schema ?? undefined,
          isValid:
            input.validation.isValid !== undefined
              ? async (val: string) => {
                  //@ts-expect-error this is fine
                  return input.validation.isValid(val, this);
                }
              : undefined,

          callback: (result: ValidationResult) => {
            input.hasError = result.status !== "success";
          },
          debounceDelay: input.validation.debounceDelay,
        };

        withValidation(element, options);
      }
    });

    el.find(".inputs").removeClass("hidden");
  }

  exec(): void {
    if (!this.canClose) return;
    if (
      this.inputs
        .filter((i) => i.hidden !== true && i.optional !== true)
        .some((v) => v.currentValue() === undefined || v.currentValue() === "")
    ) {
      Notifications.add("Please fill in all fields", 0);
      return;
    }

    if (this.inputs.some((i) => i.hasError === true)) {
      Notifications.add("Please solve all validation errors", 0);
      return;
    }

    this.disableInputs();
    Loader.show();
    const vals: string[] = this.inputs.map((it) => it.currentValue());
    void this.execFn(this, ...vals).then((res) => {
      Loader.hide();
      if (res.showNotification ?? true) {
        Notifications.add(res.message, res.status, res.notificationOptions);
      }
      if (res.status === 1) {
        void this.hide(true, res.hideOptions).then(() => {
          if (res.afterHide) {
            res.afterHide();
          }
        });
      } else {
        this.enableInputs();
        $($("#simpleModal").find("input")[0] as HTMLInputElement).trigger(
          "focus"
        );
      }
    });
  }

  disableInputs(): void {
    $("#simpleModal input").prop("disabled", true);
    $("#simpleModal button").prop("disabled", true);
    $("#simpleModal textarea").prop("disabled", true);
    $("#simpleModal .checkbox").addClass("disabled");
  }

  enableInputs(): void {
    $("#simpleModal input").prop("disabled", false);
    $("#simpleModal button").prop("disabled", false);
    $("#simpleModal textarea").prop("disabled", false);
    $("#simpleModal .checkbox").removeClass("disabled");
  }

  show(parameters: string[] = [], showOptions: ShowOptions): void {
    if (this.onlineOnly && !ConnectionState.get()) {
      Notifications.add("You are offline", 0, { duration: 2 });
      return;
    }
    activePopup = this;
    this.parameters = parameters;
    void modal.show({
      focusFirstInput: true,
      ...showOptions,
      beforeAnimation: async () => {
        this.beforeInitFn?.(this);
        this.init();
        this.beforeShowFn?.(this);
      },
    });
  }

  async hide(callerIsExec?: boolean, hideOptions?: HideOptions): Promise<void> {
    if (!this.canClose) return;
    if (this.hideCallsExec && !callerIsExec) {
      this.exec();
    } else {
      activePopup = null;
      await modal.hide(hideOptions);
    }
  }
}

function hide(): void {
  if (activePopup) {
    void activePopup.hide();
    return;
  }
}

let activePopup: SimpleModal | null = null;

const modal = new AnimatedModal({
  dialogId: "simpleModal",
  setup: async (modalEl): Promise<void> => {
    modalEl.addEventListener("submit", (e) => {
      e.preventDefault();
      activePopup?.exec();
    });
  },
  customEscapeHandler: (e): void => {
    hide();
  },
  customWrapperClickHandler: (e): void => {
    hide();
  },
});
