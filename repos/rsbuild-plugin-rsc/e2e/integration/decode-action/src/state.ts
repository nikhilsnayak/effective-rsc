let submittedMessage = 'Nothing submitted yet';

export function getSubmittedMessage() {
  return submittedMessage;
}

export function setSubmittedMessage(message: string) {
  submittedMessage = message;
}
