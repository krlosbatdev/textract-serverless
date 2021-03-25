import AWS from 'aws-sdk';
const textract = new AWS.Textract();


export async function main(event: any, context: any) {

  //https://gist.github.com/marteinn/c1071b5e22086ace14cca38ec4460fb8
  //https://github.com/aeksco/aws-pdf-textract-pipeline/blob/master/src/send-pdf-to-textract/lambda.ts

  console.log(`Event: ${JSON.stringify(event, null, 4)}`);

  // Get the object from the event
  const bucketName = event['Records'][0]['s3']['bucket']['name'];
  const documentName = event['Records'][0]['s3']['object']['key'];

  try {
    console.log('Textract startDocumentAnalysis Pdf');
    await textract
      .startDocumentAnalysis({
        DocumentLocation: {
          S3Object: {
            Bucket: bucketName,
            Name: documentName,
          },
        },
        FeatureTypes: ['TABLES', 'FORMS'],
        NotificationChannel: {
          RoleArn: process.env.textractRoleArn!,
          SNSTopicArn:  process.env.snsTopicArn!,
        },
      })
      .promise();
  } catch (error) {
    console.error(`Textract error: ${error}`);
  }
  console.log('Process Document Done!');
}