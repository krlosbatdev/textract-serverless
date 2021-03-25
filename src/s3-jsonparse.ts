
import { getFileFromS3, getSanitizedKeyValues, addKeyValuesToDynamoDB, getTextractResults } from '../libs/utils.lib';

export async function main(event: any, context: any) {
  // Logs starting message
  console.log('Start Textract response parsing');
  console.log(JSON.stringify(event, null, 4));

  //get jobID from event
  const textractJobId = JSON.parse(event['Records'][0]['Sns']['Message']).JobId;

  //get textractresult
  let data = await getTextractResults(textractJobId);

  const sanitizedKvPairs: { [key: string]: string } = getSanitizedKeyValues(data);
  //save info in Dynamo
  await addKeyValuesToDynamoDB(sanitizedKvPairs);

}
